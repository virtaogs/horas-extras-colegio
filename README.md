# App Horas Extras — Colégio

App de controle e aprovação de horas extras. Camada de **justificativa e
aprovação** — o ponto eletrônico continua sendo o registro oficial de
jornada, este sistema só organiza o fluxo de lançar, aprovar e apurar.

- **Frontend**: React + Vite (TypeScript), hospedado no GitHub Pages.
- **Backend**: Supabase (Postgres + Auth + Row Level Security).
- **Perfis**: colaborador, coordenador, RH — cada um só acessa o que a
  policy do banco libera, não é uma trava só de tela.
- **Login**: por CPF (convertido internamente para um e-mail sintético só
  para o Supabase Auth entender — nunca exibido, nunca usado pra enviar
  nada).

## Estrutura do repositório

```
sql/    scripts SQL, na ordem em que devem ser rodados (veja abaixo)
web/    o app React/Vite
.github/workflows/   deploy automático + keep-alive do Supabase
```

## 1. Criar o projeto no Supabase

1. [supabase.com](https://supabase.com) → crie conta/organização.
2. **New project** → nome (ex: `horas-extras-colegio`), senha do banco
   (guarde — não é possível ver de novo depois) e região (São Paulo/
   `sa-east-1`, se disponível).
3. Aguarde o provisionamento.
4. No menu lateral: **SQL Editor**.

## 2. Rodar os scripts SQL, nesta ordem

Cada um é uma **nova query** no SQL Editor, colar tudo e **Run**.

| Ordem | Arquivo | O que faz |
|---|---|---|
| 1 | [sql/01_schema_rls.sql](sql/01_schema_rls.sql) | Tabelas, índices, constraints, triggers e todas as policies de RLS. |
| 2 | [sql/03_funcao_meu_perfil.sql](sql/03_funcao_meu_perfil.sql) | Função que o app usa pra saber se quem logou é colaborador, coordenador ou RH. |
| 3 | [sql/05_privacidade.sql](sql/05_privacidade.sql) | Tabela de aceite do aviso de privacidade (LGPD). |
| 4 | [sql/07_prazo_lancamento.sql](sql/07_prazo_lancamento.sql) | Regras de prazo de lançamento (2 dias corridos, mês corrente, exceção do último dia), aplicadas no servidor. |
| 5 | [sql/10_painel_rh.sql](sql/10_painel_rh.sql) | Indicador de excesso (>2h/dia ou >20h/mês) e justificativa obrigatória em inclusão manual. |
| 6 | [sql/13_expurgo_anonimizacao.sql](sql/13_expurgo_anonimizacao.sql) | Função de expurgo/anonimização de ex-colaboradores. |

`sql/02_seed_dados_teste.sql` é **opcional** — só se você quiser dados
fictícios pra testar antes de cadastrar gente de verdade (veja a seção de
testes de RLS mais abaixo). Se rodar, depois é só rodar
`sql/11_limpar_dados_teste.sql` pra tirar tudo de novo.

Os arquivos `04`, `08`, `09`, `12` são scripts de correção/limpeza
pontuais que já foram usados durante o desenvolvimento — não precisam ser
rodados de novo num projeto novo.

## 3. Cadastrar pessoas reais

Cada pessoa precisa de duas coisas: um cadastro (tabela `colaboradores`
ou `coordenadores`) e um login (`auth.users`, vinculado pelo `user_id`).

**Pelo painel do RH** (depois que o app estiver publicado): aba
Colaboradores/Coordenadores → cadastra a pessoa. Isso só cria o
*cadastro*, não o login.

**Para criar o login**, no SQL Editor do Supabase (`gen_random_uuid()` e
`crypt()` exigem a extensão `pgcrypto`, já habilitada pelo script 01):

```sql
-- Troque o CPF e o nome. A senha do exemplo é só ilustrativa.
with novo as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    '12345678900@colegioatitude.local', crypt('SenhaTemporaria123', gen_salt('bf')), now(),
    '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  )
  returning id
)
insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), novo.id::text, novo.id, jsonb_build_object('sub', novo.id::text, 'email', '12345678900@colegioatitude.local'), 'email', now(), now(), now()
from novo
returning user_id;
```

Copie o `user_id` retornado e cole na coluna `user_id` da linha
correspondente em `colaboradores` ou `coordenadores` (Table Editor).

O e-mail sintético é sempre `<cpf só números>@colegioatitude.local` — é
isso que a pessoa "digita" indiretamente quando entra com o CPF na tela
de login (o app monta esse e-mail por baixo dos panos).

## 4. Publicar no GitHub Pages

1. Crie um repositório no GitHub (público — Pages grátis exige isso).
2. `cd web && npm install`
3. Configure `web/.env.production` (não commitado por padrão — veja
   `web/.env.example`) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
   do seu projeto. A anon key não é secreta (é protegida pelo RLS), então
   pode ficar num arquivo comitado se preferir simplicidade — foi assim
   que este projeto foi feito.
4. No GitHub: **Settings → Pages → Source: GitHub Actions**.
5. O workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
   já builda e publica a cada push na `main`. Ajuste o `BASE_PATH` nele
   para `/<nome-do-repositório>/`.
6. Primeiro push → aba **Actions** do GitHub mostra o deploy rodando.

## 5. Keep-alive do plano gratuito

Projetos gratuitos do Supabase pausam depois de ~7 dias sem atividade. O
workflow [.github/workflows/keep-alive.yml](.github/workflows/keep-alive.yml)
faz uma consulta simples a cada 5 dias pra evitar isso.

Configure os secrets do repositório (**Settings → Secrets and variables →
Actions**):
- `SUPABASE_URL`: a URL do seu projeto.
- `SUPABASE_ANON_KEY`: a anon key.

## 6. Expurgo / anonimização

Aba **Colaboradores** do painel do RH → seção "Expurgo/anonimização" no
final da página. Verifica quem está inativo há mais que o prazo
configurado (padrão 5 anos) e, se confirmado, anonimiza nome/matrícula
mantendo os lançamentos (para obrigação legal de guarda de registros).
Não é automático — alguém do RH precisa revisar a lista antes de
confirmar.

## Estrutura de dados e RLS

- **Tabelas**: `colaboradores`, `coordenadores`, `rh_usuarios`,
  `lancamentos`, `aceites`, `aceites_privacidade`, `historico`,
  `log_acesso`, `feriados`.
- **`rh_usuarios`** não estava na lista original de tabelas pedidas —
  existe porque o RLS do Supabase só sabe filtrar comparando com
  `auth.uid()`; sem essa tabela não haveria como a policy saber quem é
  RH. Pelo mesmo motivo, `colaboradores` e `coordenadores` têm uma
  coluna `user_id` — o vínculo entre a pessoa e a conta de login.
- **Funções auxiliares** (`is_rh`, `is_coordenador`,
  `get_colaborador_id`, `get_coordenador_id`,
  `colaborador_coordenador_id`): `SECURITY DEFINER`, respondem "quem é
  esse usuário" sem cair em recursão de RLS. Toda policy usa essas
  funções.
- **Colaborador**: só lê/insere o que é dele. Sem policy de
  `UPDATE`/`DELETE` em `lancamentos` — sem policy, o Postgres nega por
  padrão. Um trigger força `status = 'pendente'` no insert e valida o
  prazo (2 dias corridos, mês corrente, exceção do último dia até 08h do
  1º dia útil seguinte), rejeitando no servidor mesmo que alguém
  contorne a tela.
- **Coordenador**: só vê/decide lançamentos da própria equipe, e só
  enquanto `pendente`. Um trigger bloqueia qualquer alteração além do
  status.
- **RH**: acesso total via `is_rh(auth.uid())`. Só RH cadastra
  colaborador/coordenador/feriado, só RH promove outro RH (inclusive
  contra chamada direta de API), e só RH pode corrigir um status já
  decidido.
- **Indicador de excesso de jornada** (`rh_indicador_excesso_jornada()`):
  marca lançamento do dia >2h ou acumulado do mês >20h, considerando só
  aprovados. `SECURITY DEFINER`, verifica `is_rh()` antes de montar
  qualquer linha — não é uma coluna escondida por policy, é a consulta
  inteira barrada. Colaborador e coordenador não têm acesso, em nenhuma
  tela, exportação ou resposta de API.
- **Histórico**: só `INSERT` (automático via trigger a cada
  criação/mudança de status, manual para o RH registrar justificativa).
  Sem policy nem grant de `UPDATE`/`DELETE`.
- **Log de acesso**: tabela e policies prontas, mas ainda não há gatilho
  populando automaticamente — fica para quando a tela de detalhe de
  colaborador registrar cada consulta.
- **Aviso de privacidade**: `aceites_privacidade` registra usuário, texto
  aceito, versão e data/hora, na primeira vez que cada pessoa loga. Base
  legal declarada: cumprimento de obrigação legal e execução do contrato
  de trabalho — não é consentimento, mas o aceite fica registrado para
  transparência.

## Como testar as policies direto no SQL Editor

Só funciona se você tiver rodado `sql/02_seed_dados_teste.sql` (dados
fictícios). O Supabase permite simular um usuário autenticado sem login
real: define-se `role authenticated` e o `sub` do JWT localmente.

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select id, colaborador_id, status from public.lancamentos; -- só o que é do colaborador
select * from public.rh_indicador_excesso_jornada(); -- deve dar erro "acesso negado"

reset role;
```

Troque o `sub` pelos outros UUIDs de teste (coordenador
`b0000000-...-001`, RH `a0000000-...-001`) para simular cada perfil.

## Segurança de dados pessoais

- Nenhum dado pessoal aparece em URL ou parâmetro de query — o app é uma
  SPA sem router baseado em URL, todo o estado fica em memória/Supabase.
- CPF é usado só como identificador de login e matrícula — não é exibido
  em nenhuma tela fora do que o próprio RH já teria acesso.
- Arquivos com CPF real (scripts de importação de funcionários) nunca são
  commitados — ficam fora do controle de versão (veja `.gitignore`,
  padrão `sql/*_PRIVADO_*.sql`).

## Limitações conhecidas / próximos passos

- Redefinição de senha por e-mail não está disponível (login é por CPF,
  não há e-mail real cadastrado por padrão) — reset é manual, pelo RH,
  via Supabase Dashboard. Se coletar e-mail real de cada pessoa no
  futuro, dá pra ligar o fluxo padrão do Supabase Auth.
- `log_acesso` ainda não é populado automaticamente.
- Exportação em PDF usa a função de impressão do navegador (sem
  dependência extra) — funciona bem, mas o layout depende do
  navegador/impressora escolhida pelo usuário.
