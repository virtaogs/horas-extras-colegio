-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 32_prazo_dias_uteis.sql
-- Muda o prazo de lançamento de 2 DIAS CORRIDOS para 2 DIAS ÚTEIS,
-- contando segunda a sábado (só domingo e feriado cadastrado não
-- contam como dia útil — o colégio funciona aos sábados).
--
-- Isso também muda o que "dia útil" significa pra exceção do último
-- dia do mês anterior (sábado agora conta lá também).
--
-- Rode depois do 07_prazo_lancamento.sql.
-- =====================================================================

-- Novo conceito central: é dia útil = não é domingo e não é feriado
-- cadastrado. Sábado conta como dia útil de propósito.
create or replace function public.eh_dia_util(p_data date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select extract(isodow from p_data) <> 7 -- 7 = domingo (ISO); sábado (6) conta
     and not exists (select 1 from public.feriados f where f.data = p_data);
$$;

grant execute on function public.eh_dia_util(date) to authenticated;

-- primeiro_dia_util agora reaproveita eh_dia_util, então a exceção do
-- último dia do mês anterior também passa a considerar sábado como
-- dia útil.
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
    if public.eh_dia_util(v_data) then
      return v_data;
    end if;
    v_data := v_data + 1;
  end loop;
end;
$$;

-- Soma N dias úteis a uma data (avançando).
create or replace function public.somar_dias_uteis(p_data date, p_quantidade integer)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data date := p_data;
  v_restante integer := p_quantidade;
begin
  while v_restante > 0 loop
    v_data := v_data + 1;
    if public.eh_dia_util(v_data) then
      v_restante := v_restante - 1;
    end if;
  end loop;
  return v_data;
end;
$$;

grant execute on function public.somar_dias_uteis(date, integer) to authenticated;

-- Regra de prazo: agora usa dias ÚTEIS (não mais corridos) pra dados
-- dentro do mês corrente.
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
    return v_hoje <= public.somar_dias_uteis(p_data, 2);
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

-- =====================================================================
-- Fim.
-- =====================================================================
