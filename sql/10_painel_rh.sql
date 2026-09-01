-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 10_painel_rh.sql
-- Etapa 5 (parte 1 — banco): indicador de excesso com as regras exatas
-- (>2h no dia OU >20h acumuladas no mês) e justificativa obrigatória
-- nas inclusões manuais do RH.
-- Rode depois do 01_schema_rls.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Justificativa obrigatória em inclusão manual
-- ---------------------------------------------------------------------

alter table public.lancamentos
  add column if not exists justificativa_manual text;

alter table public.lancamentos
  drop constraint if exists chk_lancamentos_justificativa_manual;

-- NOT VALID: passa a exigir daqui pra frente, sem quebrar em cima de
-- lançamentos manuais antigos que não tinham esse campo.
alter table public.lancamentos
  add constraint chk_lancamentos_justificativa_manual check (
    origem <> 'rh_manual'
    or (justificativa_manual is not null and length(trim(justificativa_manual)) > 0)
  ) not valid;

-- ---------------------------------------------------------------------
-- 2. Indicador de excesso de jornada — regra exata do RH:
-- lançamento do dia > 2h OU acumulado do mês > 20h. Só RH acessa
-- (SECURITY DEFINER com checagem de perfil antes de montar qualquer
-- linha — nada disso trafega pra colaborador/coordenador).
-- ---------------------------------------------------------------------

drop function if exists public.rh_indicador_excesso_jornada(numeric);

create or replace function public.rh_indicador_excesso_jornada(
  p_limite_diario_horas numeric default 2,
  p_limite_mensal_horas numeric default 20
)
returns table (
  colaborador_id       uuid,
  nome_completo        text,
  matricula            text,
  data_hora_extra      date,
  mes_referencia       date,
  horas_no_dia         numeric,
  horas_no_mes         numeric,
  excesso_diario       boolean,
  excesso_mensal       boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_rh(auth.uid()) then
    raise exception 'acesso negado: indicador restrito ao RH';
  end if;

  return query
  with por_dia as (
    select
      l.colaborador_id,
      l.data_hora_extra,
      round(sum(extract(epoch from l.duracao_calculada)) / 3600.0, 2) as horas_no_dia
    from public.lancamentos l
    where l.status = 'aprovado'
    group by l.colaborador_id, l.data_hora_extra
  ),
  por_mes as (
    select
      l.colaborador_id,
      date_trunc('month', l.data_hora_extra)::date as mes_referencia,
      round(sum(extract(epoch from l.duracao_calculada)) / 3600.0, 2) as horas_no_mes
    from public.lancamentos l
    where l.status = 'aprovado'
    group by l.colaborador_id, date_trunc('month', l.data_hora_extra)
  )
  select
    d.colaborador_id,
    c.nome_completo,
    c.matricula,
    d.data_hora_extra,
    date_trunc('month', d.data_hora_extra)::date,
    d.horas_no_dia,
    m.horas_no_mes,
    d.horas_no_dia > p_limite_diario_horas,
    m.horas_no_mes > p_limite_mensal_horas
  from por_dia d
  join public.colaboradores c on c.id = d.colaborador_id
  join por_mes m on m.colaborador_id = d.colaborador_id
                 and m.mes_referencia = date_trunc('month', d.data_hora_extra)::date
  where d.horas_no_dia > p_limite_diario_horas
     or m.horas_no_mes > p_limite_mensal_horas
  order by d.data_hora_extra desc;
end;
$$;

grant execute on function public.rh_indicador_excesso_jornada(numeric, numeric) to authenticated;

-- =====================================================================
-- Fim.
-- =====================================================================
