-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 11_limpar_dados_teste.sql
-- Remove TODOS os dados fictícios de teste (do 02_seed_dados_teste.sql):
-- coordenador "Marcos Vinícius Souza", RH "Ana Paula Ribeiro" e os 5
-- colaboradores fictícios (Beatriz, Carlos, Daniela, Eduardo, Fernanda
-- Fernandes/Martins/Oliveira/Alves/Costa) — e os logins de teste
-- (rh@colegio.test, coordenador@colegio.test, colaborador1..5@colegio.test).
--
-- NÃO mexe em nada dos dados reais (funcionários com CPF real).
-- Rode uma vez só.
-- =====================================================================

-- 1. Lançamentos/aceites/histórico dos 5 colaboradores fictícios
delete from public.aceites
where lancamento_id in (
  select id from public.lancamentos
  where colaborador_id in (
    'e0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000005'
  )
);

delete from public.historico
where lancamento_id in (
  select id from public.lancamentos
  where colaborador_id in (
    'e0000000-0000-0000-0000-000000000001',
    'e0000000-0000-0000-0000-000000000002',
    'e0000000-0000-0000-0000-000000000003',
    'e0000000-0000-0000-0000-000000000004',
    'e0000000-0000-0000-0000-000000000005'
  )
);

delete from public.lancamentos
where colaborador_id in (
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000004',
  'e0000000-0000-0000-0000-000000000005'
);

-- 2. Os 5 colaboradores fictícios
delete from public.colaboradores
where id in (
  'e0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000004',
  'e0000000-0000-0000-0000-000000000005'
);

-- 3. Coordenador fictício ("Marcos Vinícius Souza")
delete from public.coordenadores
where id = 'd0000000-0000-0000-0000-000000000001';

-- 4. RH fictício ("Ana Paula Ribeiro"), se ainda existir com esse UUID
delete from public.rh_usuarios
where user_id = 'a0000000-0000-0000-0000-000000000001';

-- 5. Logins de teste (auth.identities depende de auth.users)
delete from auth.identities
where user_id in (
  select id from auth.users where email like '%@colegio.test'
);

delete from auth.users
where email like '%@colegio.test';

-- =====================================================================
-- Fim.
-- =====================================================================
