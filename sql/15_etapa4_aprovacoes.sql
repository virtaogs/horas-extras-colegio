-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 15_etapa4_aprovacoes.sql
-- Etapa 4: tela de aprovações (coordenador + RH).
--
-- - Recusa sempre exige justificativa (motivo_decisao).
-- - Quando o RH decide (aprova ou recusa), também exige motivo — é
--   como fica registrado "decidiu por cima do coordenador, com motivo".
-- - decidido_por_perfil grava quem decidiu ('coordenador' ou 'rh'),
--   direto na linha do lançamento, sem precisar de outra consulta pra
--   descobrir (evita problema de permissão pro coordenador enxergar
--   "quem é RH").
-- - O histórico (já imutável) passa a guardar o motivo também.
--
-- Rode depois do 01_schema_rls.sql (e do 10_painel_rh.sql, se já tiver
-- rodado — não depende dele, mas é a ordem natural).
-- =====================================================================

alter table public.lancamentos
  add column if not exists motivo_decisao text;

alter table public.lancamentos
  add column if not exists decidido_por_perfil text
    check (decidido_por_perfil in ('coordenador', 'rh'));

-- ---------------------------------------------------------------------
-- Trigger de update: agora também valida/gravar motivo_decisao e
-- decidido_por_perfil.
-- ---------------------------------------------------------------------

create or replace function public.trg_lancamentos_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if public.is_rh(v_uid) then
    if new.status is distinct from old.status then
      if new.status in ('aprovado', 'recusado')
         and (new.motivo_decisao is null or length(trim(new.motivo_decisao)) = 0) then
        raise exception 'motivo obrigatório para o RH aprovar ou recusar';
      end if;
      new.aprovado_por := v_uid;
      new.decidido_em := now();
      new.decidido_por_perfil := 'rh';
    end if;
    return new;
  end if;

  if public.is_coordenador(v_uid)
     and public.colaborador_coordenador_id(old.colaborador_id) = public.get_coordenador_id(v_uid) then

    if old.status <> 'pendente' then
      raise exception 'lançamento já decidido, não pode ser alterado';
    end if;

    if new.status not in ('aprovado', 'recusado') then
      raise exception 'coordenador só pode aprovar ou recusar';
    end if;

    if new.status = 'recusado'
       and (new.motivo_decisao is null or length(trim(new.motivo_decisao)) = 0) then
      raise exception 'justificativa obrigatória para recusar';
    end if;

    if new.colaborador_id is distinct from old.colaborador_id
       or new.data_hora_extra is distinct from old.data_hora_extra
       or new.hora_entrada is distinct from old.hora_entrada
       or new.hora_saida is distinct from old.hora_saida
       or new.motivo is distinct from old.motivo
       or new.motivo_outro_texto is distinct from old.motivo_outro_texto
       or new.destino is distinct from old.destino
       or new.origem is distinct from old.origem
       or new.enviado_em is distinct from old.enviado_em then
      raise exception 'coordenador só pode alterar o status do lançamento';
    end if;

    new.aprovado_por := v_uid;
    new.decidido_em := now();
    new.decidido_por_perfil := 'coordenador';
    return new;
  end if;

  raise exception 'sem permissão para alterar este lançamento';
end;
$$;

-- ---------------------------------------------------------------------
-- Histórico automático passa a levar o motivo também.
-- ---------------------------------------------------------------------

create or replace function public.trg_lancamentos_historico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.historico (lancamento_id, acao, usuario_id)
    values (new.id, 'criado', auth.uid());
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.historico (lancamento_id, acao, usuario_id, justificativa)
    values (
      new.id,
      'status_alterado_para_' || new.status || coalesce('_por_' || new.decidido_por_perfil, ''),
      auth.uid(),
      new.motivo_decisao
    );
  end if;
  return new;
end;
$$;

-- =====================================================================
-- Fim.
-- =====================================================================
