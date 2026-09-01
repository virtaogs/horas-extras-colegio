-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 13_expurgo_anonimizacao.sql
-- Etapa 5 (fechamento): rotina de expurgo/anonimização, padrão 5 anos.
--
-- Não roda sozinha — é uma função que o RH aciona quando quiser (via
-- RPC no app, ou direto no SQL Editor). Automatizar com pg_cron é
-- opcional e fica só documentado no README, porque exclusão de dados
-- de ex-funcionário é uma decisão que vale ter alguém decidindo, não
-- rodar sozinha sem ninguém olhar.
--
-- O QUE FAZ
-- Para colaboradores INATIVOS cujo último lançamento (ou cadastro, se
-- nunca lançou nada) tem mais que N anos (padrão 5): anonimiza nome e
-- matrícula (mantém os registros de horas para fins de auditoria/
-- obrigação legal, só remove a identificação pessoal), e apaga o
-- vínculo com o login (user_id), sem apagar o histórico.
-- Rode depois do 01_schema_rls.sql.
-- =====================================================================

create or replace function public.anonimizar_colaboradores_antigos(
  p_anos_retencao integer default 5,
  p_somente_simular boolean default true
)
returns table (
  colaborador_id  uuid,
  nome_anterior   text,
  matricula_anterior text,
  ultima_atividade date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite date := (current_date - (p_anos_retencao || ' years')::interval)::date;
  r record;
begin
  if not public.is_rh(auth.uid()) then
    raise exception 'acesso negado: expurgo restrito ao RH';
  end if;

  for r in
    select
      c.id,
      c.nome_completo,
      c.matricula,
      coalesce(max(l.data_hora_extra), c.created_at::date) as ultima_atividade
    from public.colaboradores c
    left join public.lancamentos l on l.colaborador_id = c.id
    where c.ativo = false
      and c.nome_completo not like 'Ex-colaborador %'
    group by c.id, c.nome_completo, c.matricula, c.created_at
    having coalesce(max(l.data_hora_extra), c.created_at::date) < v_limite
  loop
    colaborador_id := r.id;
    nome_anterior := r.nome_completo;
    matricula_anterior := r.matricula;
    ultima_atividade := r.ultima_atividade;

    if not p_somente_simular then
      update public.colaboradores
      set nome_completo = 'Ex-colaborador ' || substr(r.id::text, 1, 8),
          matricula = 'ANON-' || substr(r.id::text, 1, 8),
          cargo = null,
          user_id = null
      where id = r.id;

      insert into public.historico (lancamento_id, acao, usuario_id)
      select l.id, 'dados_pessoais_anonimizados', auth.uid()
      from public.lancamentos l
      where l.colaborador_id = r.id;
    end if;

    return next;
  end loop;
end;
$$;

grant execute on function public.anonimizar_colaboradores_antigos(integer, boolean) to authenticated;

comment on function public.anonimizar_colaboradores_antigos is
  'Chame primeiro com p_somente_simular=true pra ver quem seria afetado. '
  'Rode com p_somente_simular=false só depois de confirmar a lista. '
  'Mantém os lançamentos (só sem nome/matrícula) — a obrigação legal é '
  'guardar o registro de horas, não necessariamente vinculado ao nome.';

-- =====================================================================
-- Fim.
-- =====================================================================
