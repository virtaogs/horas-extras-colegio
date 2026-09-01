-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 05_privacidade.sql
-- Aceite do aviso de privacidade (LGPD), registrado por usuário/versão.
-- Rode depois do 01_schema_rls.sql (independe do seed).
-- =====================================================================

create table public.aceites_privacidade (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  texto_aceito  text not null,
  versao_texto  text not null,
  aceito_em     timestamptz not null default now()
);

create index idx_aceites_privacidade_user_id on public.aceites_privacidade(user_id);

alter table public.aceites_privacidade enable row level security;
alter table public.aceites_privacidade force row level security;

revoke all on public.aceites_privacidade from anon, public;
grant select, insert on public.aceites_privacidade to authenticated;

-- Cada um só vê/insere o próprio aceite; RH vê todos (auditoria).
create policy aceites_privacidade_select on public.aceites_privacidade
  for select
  using (user_id = auth.uid() or public.is_rh(auth.uid()));

create policy aceites_privacidade_insert on public.aceites_privacidade
  for insert
  with check (user_id = auth.uid());

-- Sem update/delete para ninguém: aceite é imutável, igual ao histórico.

comment on table public.aceites_privacidade is 'Aceite do aviso de privacidade (LGPD) no primeiro acesso, por versão do texto. Base legal: cumprimento de obrigação legal e execução do contrato de trabalho — não é consentimento, mas o aceite fica registrado para transparência.';
