# App Horas Extras — Colégio (Etapa 1: estrutura de dados)

Esta etapa entrega **só o banco**: tabelas, índices, constraints e Row Level
Security (RLS) no Supabase. Sem interface ainda.

Este app é a camada de **justificativa e aprovação** de horas extras. O
ponto eletrônico continua sendo o registro oficial de jornada.

## Arquivos

- [sql/01_schema_rls.sql](sql/01_schema_rls.sql) — script completo: tabelas, índices, constraints, triggers e policies de RLS.
- [sql/02_seed_dados_teste.sql](sql/02_seed_dados_teste.sql) — massa de teste: 5 colaboradores, 1 coordenador, 1 RH, lançamentos em estados variados.

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta/organização, se ainda não tiver.
2. **New project** → escolha um nome (ex: `horas-extras-colegio`), uma senha forte para o banco (guarde-a) e a região mais próxima (ex: São Paulo/`sa-east-1`, se disponível).
3. Aguarde o provisionamento (leva 1–2 minutos).
4. No menu lateral, vá em **SQL Editor**.

## 2. Rodar o script de schema

1. No SQL Editor, clique em **New query**.
2. Cole todo o conteúdo de [sql/01_schema_rls.sql](sql/01_schema_rls.sql).
3. Clique em **Run**. Deve terminar sem erros (ele já inclui `create extension if not exists pgcrypto`).
4. Confira em **Table Editor** que as 8 tabelas apareceram: `rh_usuarios`, `coordenadores`, `colaboradores`, `lancamentos`, `aceites`, `historico`, `log_acesso`, `feriados`.

## 3. Rodar a massa de dados de teste

1. Nova query no SQL Editor.
2. Cole todo o conteúdo de [sql/02_seed_dados_teste.sql](sql/02_seed_dados_teste.sql).
3. **Run**.

Isso cria:
- 7 usuários em `auth.users` (senha de teste `senha123` para todos, e-mails `rh@colegio.test`, `coordenador@colegio.test`, `colaborador1@colegio.test` … `colaborador5@colegio.test`). **Esses usuários servem só para satisfazer a chave estrangeira e simular perfis no SQL Editor — não são login real da aplicação.** Quando a interface existir, crie os usuários reais por *Authentication > Users* (ou pela API de signup) e atualize a coluna `user_id` nas tabelas correspondentes com o UUID gerado pelo Supabase Auth.
- 1 RH, 1 coordenador, 5 colaboradores vinculados ao coordenador.
- 6 feriados de 2026.
- 5 lançamentos (um por colaborador) em status variados: aprovado, pendente, recusado, pendente (inclusão manual do RH) e aprovado.
- Aceites e histórico correspondentes.

## Por que existe a tabela `rh_usuarios`

Você pediu as tabelas `colaboradores`, `coordenadores`, `lancamentos`, `aceites`,
`historico`, `log_acesso` e `feriados`. Adicionei `rh_usuarios` porque o RLS
do Supabase só sabe filtrar linhas comparando com `auth.uid()` — sem uma
tabela dizendo "este `auth.users.id` é RH", não existe como a policy
diferenciar RH de coordenador de colaborador. Pelo mesmo motivo,
`colaboradores` e `coordenadores` ganharam uma coluna `user_id` (referência
a `auth.users`), que é o vínculo entre a pessoa física e a conta de login.

## Como as regras de acesso foram implementadas

- **Funções auxiliares** (`is_rh`, `is_coordenador`, `get_colaborador_id`, `get_coordenador_id`, `colaborador_coordenador_id`): rodam como `SECURITY DEFINER` para responder "quem é esse usuário" sem cair em recursão de RLS. Toda policy usa essas funções.
- **Colaborador**: `SELECT`/`INSERT` só do que é dele (`lancamentos_insert_colaborador`, `colaboradores_select`). Não existe policy de `UPDATE`/`DELETE` para colaborador em `lancamentos` — sem policy, o Postgres nega por padrão. Um trigger (`trg_lancamentos_before_insert`) também força `status = 'pendente'` e zera `aprovado_por`/`decidido_em` no insert, não importa o que o cliente mande.
- **Coordenador**: enxerga e atualiza só os lançamentos de colaboradores com `coordenador_id` igual ao dele, e só enquanto `status = 'pendente'`. Um trigger (`trg_lancamentos_before_update`) bloqueia qualquer tentativa de alterar campos além do status.
- **RH**: `is_rh(auth.uid())` libera tudo nas policies. Só o RH pode inserir/atualizar `colaboradores`, `coordenadores`, `feriados`, e é o único que pode inserir em `rh_usuarios` (`rh_usuarios_insert` exige `is_rh(auth.uid())`) — ou seja, **só um RH promove outro RH**, nunca um colaborador ou coordenador, nem por chamada direta à API. O primeiro RH do sistema só pode ser criado via SQL Editor/service role (que sempre ignora RLS), o que já é, por si só, uma barreira de acesso equivalente a "só admin cria o primeiro RH".
- **Indicador de excesso de jornada**: não existe como coluna em `lancamentos` nem em view comum. É a função `rh_indicador_excesso_jornada()`, `SECURITY DEFINER`, que verifica `is_rh(auth.uid())` **antes** de montar qualquer linha e lança exceção para quem não é RH. Assim o dado nunca chega a existir na resposta para colaborador/coordenador — não é uma coluna escondida, é a consulta inteira barrada na camada de dados.
- **Histórico**: só `INSERT` (automático via trigger a cada criação/mudança de status, e manual para o RH registrar justificativa). Não há policy nem grant de `UPDATE`/`DELETE` — imutável em duas camadas (RLS e GRANT).
- **Log de acesso**: tabela e policies prontas (`SELECT` só RH, `INSERT` de qualquer usuário autenticado só na própria linha). Nesta etapa **não há gatilho automático populando essa tabela** — isso terá que ser feito pela aplicação, quando a interface existir, a cada consulta a dados de um colaborador.

## Como testar as policies no SQL Editor, simulando cada perfil

O Supabase permite simular um usuário autenticado numa sessão SQL sem
precisar de login real: você define localmente o papel `authenticated` e o
`request.jwt.claims` com o `sub` (UUID do usuário). Isso é só para teste —
a aplicação de verdade recebe esse JWT automaticamente do Supabase Auth.

Abra uma **nova query** no SQL Editor para cada teste (ou rode `reset role;`
entre os blocos).

### Como colaborador (Beatriz — só vê o que é dela)

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select id, colaborador_id, status from public.lancamentos; -- só deve trazer o lançamento dela
select * from public.rh_indicador_excesso_jornada(); -- deve dar erro "acesso negado"

reset role;
```

### Como coordenador (Marcos — vê e aprova a equipe dele)

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select id, colaborador_id, status from public.lancamentos; -- deve trazer os 5 lançamentos da equipe
update public.lancamentos set status = 'aprovado' where id = 'f0000000-0000-0000-0000-000000000002'; -- deve funcionar (estava pendente)
update public.lancamentos set hora_entrada = '06:00' where id = 'f0000000-0000-0000-0000-000000000001'; -- deve dar erro: só pode mudar status, e o lançamento já não está pendente
select * from public.rh_indicador_excesso_jornada(); -- deve dar erro "acesso negado"

reset role;
```

### Como RH (Ana Paula — acesso total)

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select count(*) from public.lancamentos; -- deve trazer todos
select * from public.rh_indicador_excesso_jornada(10); -- deve funcionar e retornar o indicador
insert into public.rh_usuarios (user_id, nome) values ('c0000000-0000-0000-0000-000000000004', 'Eduardo (novo RH)'); -- deve funcionar, só RH promove RH
delete from public.historico where lancamento_id = 'f0000000-0000-0000-0000-000000000001'; -- deve dar erro: sem policy de delete

reset role;
```

### Tentando burlar (colaborador tentando virar RH)

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}';

insert into public.rh_usuarios (user_id, nome) values ('c0000000-0000-0000-0000-000000000002', 'Carlos (tentando virar RH)');
-- deve dar erro de RLS: "new row violates row-level security policy"

reset role;
```

Se algum `select` trouxer 0 linhas quando deveria trazer, ou algum `insert`/`update` passar quando deveria falhar, é sinal de que a policy correspondente precisa de ajuste.

## Próximos passos (fora desta etapa)

- Interface (provavelmente React/Vite no GitHub Pages) consumindo o Supabase via `supabase-js`, usando o Supabase Auth para login real.
- Popular `log_acesso` a partir da aplicação a cada consulta a dados de colaborador.
- Revisar a lista de `motivo` em `lancamentos` (hoje é um placeholder) e o limite de horas usado em `rh_indicador_excesso_jornada`.
