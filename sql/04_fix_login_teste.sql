-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 04_fix_login_teste.sql
-- Corrige os usuários de teste criados em 02_seed_dados_teste.sql para
-- que o login por e-mail/senha funcione (o GoTrue exige alguns campos
-- como string vazia, não null, e uma linha em auth.identities).
-- Rode uma vez, depois do 02_seed_dados_teste.sql.
-- =====================================================================

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, ''),
  email_confirmed_at = coalesce(email_confirmed_at, now())
where email like '%@colegio.test';

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email like '%@colegio.test'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- =====================================================================
-- Fim.
-- =====================================================================
