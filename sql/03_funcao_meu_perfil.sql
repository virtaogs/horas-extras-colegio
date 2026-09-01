-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 03_funcao_meu_perfil.sql
-- Função auxiliar para o frontend: "quem é o usuário logado?"
-- Rode depois do 01_schema_rls.sql. Não depende do seed.
-- =====================================================================

create or replace function public.meu_perfil()
returns table (
  perfil          text,
  id              uuid,
  nome            text,
  coordenador_id  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select perfil, id, nome, coordenador_id
  from (
    select 'rh'::text as perfil, r.id, r.nome, null::uuid as coordenador_id, 1 as prioridade
    from public.rh_usuarios r
    where r.user_id = auth.uid() and r.ativo

    union all

    select 'coordenador'::text, c.id, c.nome, null::uuid, 2
    from public.coordenadores c
    where c.user_id = auth.uid() and c.ativo

    union all

    select 'colaborador'::text, co.id, co.nome_completo, co.coordenador_id, 3
    from public.colaboradores co
    where co.user_id = auth.uid() and co.ativo
  ) x
  order by prioridade
  limit 1;
$$;

grant execute on function public.meu_perfil() to authenticated;

comment on function public.meu_perfil() is 'Usado pelo frontend logo após o login para decidir qual dashboard mostrar.';
