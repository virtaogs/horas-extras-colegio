-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 33_prazo_mes_inteiro.sql
-- Remove o limite de "2 dias úteis": o colaborador pode lançar/ajustar hora
-- extra de QUALQUER dia do mês corrente (do dia 1 até hoje). Datas futuras
-- continuam bloqueadas. A exceção do último dia do mês anterior (até 08h do
-- primeiro dia útil) continua como estava.
-- Rode depois do 32_prazo_dias_uteis.sql.
-- =====================================================================

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

  -- qualquer dia do mês corrente (sem limite de dias úteis)
  if p_data >= v_inicio_mes then
    return true;
  end if;

  -- exceção: último dia do mês anterior, até 08h do primeiro dia útil do mês
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
