-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 02_seed_dados_teste.sql
-- Massa de dados de teste: 5 colaboradores, 1 coordenador, 1 RH
-- Rode DEPOIS do 01_schema_rls.sql, no SQL Editor do Supabase.
-- =====================================================================
--
-- Cria também as linhas correspondentes em auth.users, com UUIDs fixos
-- e senhas dummy. Isso é só para satisfazer a FK auth.users(id) e para
-- simular cada perfil no SQL Editor (seção "como testar" do README).
-- Essas linhas NÃO habilitam login real pelo GoTrue/app — para logins
-- reais, crie os usuários por Authentication > Users ou pela API e
-- depois atualize o user_id nas tabelas abaixo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. auth.users de teste
-- ---------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rh@colegio.test',          crypt('senha123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'coordenador@colegio.test', crypt('senha123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'colaborador1@colegio.test', crypt('senha123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'colaborador2@colegio.test', crypt('senha123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'colaborador3@colegio.test', crypt('senha123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'colaborador4@colegio.test', crypt('senha123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'colaborador5@colegio.test', crypt('senha123', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now())
on conflict (id) do nothing;

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now()
from auth.users u
where u.email like '%@colegio.test'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. RH (o próprio bootstrap do primeiro RH só é possível via
-- service_role / SQL Editor logado como postgres — é exatamente por
-- isso que o SQL Editor bypassa RLS aqui).
-- ---------------------------------------------------------------------

insert into public.rh_usuarios (user_id, nome, ativo) values
  ('a0000000-0000-0000-0000-000000000001', 'Ana Paula Ribeiro (RH)', true);

-- ---------------------------------------------------------------------
-- 3. Coordenador
-- ---------------------------------------------------------------------

insert into public.coordenadores (id, user_id, nome, setor, ativo) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Marcos Vinícius Souza', 'Ensino Fundamental', true);

-- ---------------------------------------------------------------------
-- 4. Colaboradores
-- ---------------------------------------------------------------------

insert into public.colaboradores (id, user_id, nome_completo, matricula, cargo, setor, coordenador_id, ativo) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Beatriz Fernandes Lima',   '00101', 'Professora',        'Ensino Fundamental', 'd0000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Carlos Eduardo Martins',   '00102', 'Professor',         'Ensino Fundamental', 'd0000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'Daniela Santos Oliveira',  '00103', 'Coordenadora Pedagógica Auxiliar', 'Ensino Fundamental', 'd0000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'Eduardo Alves Pereira',    '00104', 'Auxiliar Administrativo', 'Secretaria', 'd0000000-0000-0000-0000-000000000001', true),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 'Fernanda Costa Rodrigues', '00105', 'Professora',        'Ensino Fundamental', 'd0000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------
-- 5. Feriados
-- ---------------------------------------------------------------------

insert into public.feriados (data, descricao) values
  ('2026-01-01', 'Confraternização Universal'),
  ('2026-04-21', 'Tiradentes'),
  ('2026-09-07', 'Independência do Brasil'),
  ('2026-10-12', 'Nossa Senhora Aparecida'),
  ('2026-11-02', 'Finados'),
  ('2026-12-25', 'Natal');

-- ---------------------------------------------------------------------
-- 6. Lançamentos de exemplo (um por colaborador, estados variados)
-- Os triggers de negócio (trg_lancamentos_bi/bu) forçam status =
-- 'pendente' no insert e travam quem pode mudar o status, porque
-- pressupõem auth.uid() de uma sessão real. Rodando pelo SQL Editor
-- não existe JWT (auth.uid() é null), então desligamos os triggers de
-- usuário só para esta massa de teste e religamos em seguida — assim
-- conseguimos simular lançamentos já aprovados/recusados sem violar a
-- regra para o fluxo real da aplicação.
-- ---------------------------------------------------------------------

alter table public.lancamentos disable trigger user;

insert into public.lancamentos
  (id, colaborador_id, data_hora_extra, hora_entrada, hora_saida, motivo, motivo_outro_texto, status, destino, origem, aprovado_por, decidido_em)
values
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', '2026-08-10', '18:00', '20:00', 'reuniao_pedagogica', null, 'aprovado', 'banco_horas', 'colaborador', 'b0000000-0000-0000-0000-000000000001', now()),
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', '2026-08-11', '07:00', '08:30', 'cobertura_ausencia', null, 'pendente', 'folha', 'colaborador', null, null),
  ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', '2026-08-12', '19:00', '21:30', 'evento_escolar', null, 'recusado', 'banco_horas', 'colaborador', 'b0000000-0000-0000-0000-000000000001', now()),
  ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000004', '2026-08-13', '17:30', '19:00', 'demanda_urgente', null, 'pendente', 'folha', 'rh_manual', null, null),
  ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000005', '2026-08-14', '18:00', '22:00', 'outro', 'Cobertura de plantão de aplicação de prova', 'aprovado', 'banco_horas', 'colaborador', 'a0000000-0000-0000-0000-000000000001', now());

alter table public.lancamentos enable trigger user;

-- Como os triggers estavam desligados, o histórico automático de
-- "criado" e das decisões não foi gerado — inserimos manualmente para
-- refletir o estado final simulado acima.
insert into public.historico (lancamento_id, acao, usuario_id) values
  ('f0000000-0000-0000-0000-000000000001', 'criado', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000001', 'status_alterado_para_aprovado', 'b0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'criado', 'c0000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-000000000003', 'criado', 'c0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000003', 'status_alterado_para_recusado', 'b0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000004', 'criado', 'a0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000005', 'criado', 'c0000000-0000-0000-0000-000000000005'),
  ('f0000000-0000-0000-0000-000000000005', 'status_alterado_para_aprovado', 'a0000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------
-- 7. Aceites correspondentes
-- ---------------------------------------------------------------------

insert into public.aceites (lancamento_id, texto_aceito, versao_texto, user_id) values
  ('f0000000-0000-0000-0000-000000000001', 'Declaro que as informações acima são verdadeiras e que a hora extra foi previamente combinada.', 'v1', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', 'Declaro que as informações acima são verdadeiras e que a hora extra foi previamente combinada.', 'v1', 'c0000000-0000-0000-0000-000000000002'),
  ('f0000000-0000-0000-0000-000000000003', 'Declaro que as informações acima são verdadeiras e que a hora extra foi previamente combinada.', 'v1', 'c0000000-0000-0000-0000-000000000003'),
  ('f0000000-0000-0000-0000-000000000005', 'Declaro que as informações acima são verdadeiras e que a hora extra foi previamente combinada.', 'v1', 'c0000000-0000-0000-0000-000000000005');

-- ---------------------------------------------------------------------
-- 8. Histórico manual de exemplo (os automáticos já foram gerados
-- pelos triggers de insert/update acima)
-- ---------------------------------------------------------------------

insert into public.historico (lancamento_id, acao, usuario_id, justificativa) values
  ('f0000000-0000-0000-0000-000000000003', 'recusado_com_observacao', 'b0000000-0000-0000-0000-000000000001', 'Evento não estava na programação aprovada previamente pela coordenação.');

-- =====================================================================
-- Fim da massa de dados de teste.
-- =====================================================================
