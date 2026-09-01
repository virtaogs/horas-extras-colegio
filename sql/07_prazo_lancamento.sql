-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 07_prazo_lancamento.sql
-- Etapa 3: regras de prazo do lançamento, aplicadas NO SERVIDOR (não só
-- no navegador) — quem tenta burlar pelo DevTools/API direta é barrado
-- aqui também.
--
-- REGRAS
-- - Nunca data futura.
-- - Só é possível lançar dentro do mês corrente.
-- - Prazo de 2 dias corridos após a data da hora extra.
-- - Exceção: o último dia do mês anterior pode ser lançado até as 08h
--   do primeiro dia útil do mês corrente (considerando fins de semana
--   e feriados cadastrados). Depois disso, recusa.
-- - Essas regras valem só para origem = 'colaborador'. Inclusão manual
--   do RH (origem = 'rh_manual') não é afetada — é assim que o RH
--   registra lançamentos fora do prazo (Etapa 5).
-- - Duplicidade (mesma pessoa + mesma data + mesmo horário) é barrada
--   por um índice único, não só por lógica de aplicação.
--
-- Fuso horário de referência: America/Sao_Paulo.
-- Rode depois do 01_schema_rls.sql.
-- =====================================================================

create or replace function public.primeiro_dia_util(p_data date)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data date := p_data;
begin
  loop
    if extract(isodow from v_data) not in (6, 7) -- sábado, domingo
       and not exists (select 1 from public.feriados f where f.data = v_data) then
      return v_data;
    end if;
    v_data := v_data + 1;
  end loop;
end;
$$;

grant execute on function public.primeiro_dia_util(date) to authenticated;

create or replace function public.pode_lancar_hora_extra(p_data date, p_agora timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := (p_agora at time zone 'America/Sao_Paulo')::date;
  v_agora_local timestamp := (p_agora at time zone 'America/Sao_Paulo');
  v_inicio_mes date := date_trunc('month', v_hoje)::date;
  v_ultimo_dia_mes_anterior date := v_inicio_mes - 1;
  v_primeiro_dia_util date;
begin
  if p_data > v_hoje then
    return false;
  end if;

  if p_data >= v_inicio_mes then
    return v_hoje <= (p_data + 2);
  end if;

  if p_data = v_ultimo_dia_mes_anterior then
    v_primeiro_dia_util := public.primeiro_dia_util(v_inicio_mes);
    if v_hoje < v_primeiro_dia_util then
      return true;
    elsif v_hoje = v_primeiro_dia_util then
      return v_agora_local::time <= time '08:00:00';
    else
      return false;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.pode_lancar_hora_extra(date, timestamptz) to authenticated;

-- Duplicidade: mesma pessoa, mesma data, mesmo intervalo — barrado no
-- banco, não só na tela.
create unique index if not exists idx_lancamentos_sem_duplicidade
  on public.lancamentos (colaborador_id, data_hora_extra, hora_entrada, hora_saida);

-- Atualiza o trigger de insert para aplicar as regras de prazo quando
-- a origem for o próprio colaborador.
create or replace function public.trg_lancamentos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'pendente';
  new.enviado_em := coalesce(new.enviado_em, now());
  new.aprovado_por := null;
  new.decidido_em := null;

  if new.origem = 'colaborador' then
    if new.data_hora_extra > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'não é possível lançar hora extra com data futura';
    end if;
    if not public.pode_lancar_hora_extra(new.data_hora_extra) then
      raise exception 'prazo para lançar esta hora extra encerrado — procure o RH';
    end if;
  end if;

  return new;
end;
$$;

-- =====================================================================
-- Fim.
-- =====================================================================
