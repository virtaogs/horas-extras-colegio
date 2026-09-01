-- =====================================================================
-- APP HORAS EXTRAS — Colégio
-- 01_schema_rls.sql
-- Estrutura de dados + Row Level Security (RLS)
-- Rode este script inteiro no SQL Editor do Supabase (projeto novo, vazio)
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. TABELA DE VÍNCULO: RH
-- -----------------------------------------------------------------------
-- Não foi pedida explicitamente na lista de tabelas, mas é necessária:
-- o Supabase Auth só sabe autenticar (auth.users). Sem uma tabela que
-- diga "este auth.users é o RH", não existe como o RLS diferenciar
-- colaborador de coordenador de RH. Estas 3 tabelas de vínculo
-- (rh_usuarios, e o user_id dentro de colaboradores/coordenadores)
-- fazem essa ponte.
-- =====================================================================

create table public.rh_usuarios (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete restrict,
  nome          text not null,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.rh_usuarios is 'Usuários com perfil de RH. Hoje só existe um, mas a tabela permite mais de um.';

-- =====================================================================
-- 2. COORDENADORES
-- =====================================================================

create table public.coordenadores (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete restrict,
  nome          text not null,
  setor         text,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =====================================================================
-- 3. COLABORADORES
-- =====================================================================

create table public.colaboradores (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references auth.users(id) on delete restrict,
  nome_completo       text not null,
  matricula           text not null unique,
  cargo               text,
  setor               text,
  coordenador_id      uuid references public.coordenadores(id) on delete set null,
  ativo               boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_colaboradores_coordenador_id on public.colaboradores(coordenador_id);
create index idx_colaboradores_user_id on public.colaboradores(user_id);

-- =====================================================================
-- 4. LANÇAMENTOS (horas extras)
-- =====================================================================

create table public.lancamentos (
  id                    uuid primary key default gen_random_uuid(),
  colaborador_id        uuid not null references public.colaboradores(id) on delete restrict,
  data_hora_extra       date not null,
  hora_entrada          time not null,
  hora_saida            time not null,
  duracao_calculada     interval generated always as (
                           case
                             when hora_saida >= hora_entrada
                               then hora_saida - hora_entrada
                             else interval '24:00:00' + (hora_saida - hora_entrada)
                           end
                         ) stored,
  motivo                text not null check (motivo in (
                           'reuniao_pedagogica',
                           'evento_escolar',
                           'cobertura_ausencia',
                           'demanda_urgente',
                           'fechamento_periodo_letivo',
                           'outro'
                         )),
  motivo_outro_texto    text,
  status                text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  destino               text not null check (destino in ('banco_horas', 'folha')),
  origem                text not null check (origem in ('colaborador', 'rh_manual')),
  enviado_em            timestamptz not null default now(),
  aprovado_por          uuid references auth.users(id),
  decidido_em           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_lancamentos_horario_diferente check (hora_entrada <> hora_saida),
  constraint chk_lancamentos_motivo_outro check (
    motivo <> 'outro' or (motivo_outro_texto is not null and length(trim(motivo_outro_texto)) > 0)
  )
);

create index idx_lancamentos_colaborador_id on public.lancamentos(colaborador_id);
create index idx_lancamentos_status on public.lancamentos(status);
create index idx_lancamentos_data on public.lancamentos(data_hora_extra);

comment on column public.lancamentos.motivo is 'Lista inicial de motivos — ajuste os valores do CHECK conforme a realidade do colégio.';

-- =====================================================================
-- 5. ACEITES (termo/ciência aceita ao enviar o lançamento)
-- =====================================================================

create table public.aceites (
  id            uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos(id) on delete restrict,
  texto_aceito  text not null,
  versao_texto  text not null,
  aceito_em     timestamptz not null default now(),
  user_id       uuid not null references auth.users(id)
);

create index idx_aceites_lancamento_id on public.aceites(lancamento_id);

-- =====================================================================
-- 6. HISTÓRICO (auditoria — somente inserção)
-- =====================================================================

create table public.historico (
  id             uuid primary key default gen_random_uuid(),
  lancamento_id  uuid not null references public.lancamentos(id) on delete restrict,
  acao           text not null,
  usuario_id     uuid not null references auth.users(id),
  data_hora      timestamptz not null default now(),
  justificativa  text
);

create index idx_historico_lancamento_id on public.historico(lancamento_id);

-- =====================================================================
-- 7. LOG DE ACESSO (quem consultou dados de qual colaborador)
-- =====================================================================

create table public.log_acesso (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users(id),
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  data_hora      timestamptz not null default now()
);

create index idx_log_acesso_colaborador_id on public.log_acesso(colaborador_id);
create index idx_log_acesso_usuario_id on public.log_acesso(usuario_id);

comment on table public.log_acesso is 'Nesta etapa só existe a tabela/policies. O INSERT de cada consulta deve ser disparado pela aplicação quando a interface for construída.';

-- =====================================================================
-- 8. FERIADOS
-- =====================================================================

create table public.feriados (
  id           uuid primary key default gen_random_uuid(),
  data         date not null unique,
  descricao    text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =====================================================================
-- 9. TRIGGERS DE APOIO (updated_at)
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_colaboradores_updated_at before update on public.colaboradores
  for each row execute function public.set_updated_at();
create trigger trg_coordenadores_updated_at before update on public.coordenadores
  for each row execute function public.set_updated_at();
create trigger trg_rh_usuarios_updated_at before update on public.rh_usuarios
  for each row execute function public.set_updated_at();
create trigger trg_lancamentos_updated_at before update on public.lancamentos
  for each row execute function public.set_updated_at();
create trigger trg_feriados_updated_at before update on public.feriados
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 10. FUNÇÕES DE APOIO PARA AS POLICIES (SECURITY DEFINER)
-- -----------------------------------------------------------------------
-- SECURITY DEFINER + search_path fixo: essas funções rodam com o
-- privilégio do dono (bypassa RLS) só para responder "quem é esse
-- usuário", evitando recursão infinita nas policies das tabelas que
-- elas consultam.
-- =====================================================================

create or replace function public.is_rh(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.rh_usuarios r
    where r.user_id = p_user_id and r.ativo
  );
$$;

create or replace function public.is_coordenador(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coordenadores c
    where c.user_id = p_user_id and c.ativo
  );
$$;

create or replace function public.get_colaborador_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.colaboradores where user_id = p_user_id and ativo;
$$;

create or replace function public.get_coordenador_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.coordenadores where user_id = p_user_id and ativo;
$$;

create or replace function public.colaborador_coordenador_id(p_colaborador_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coordenador_id from public.colaboradores where id = p_colaborador_id;
$$;

grant execute on function public.is_rh(uuid) to authenticated;
grant execute on function public.is_coordenador(uuid) to authenticated;
grant execute on function public.get_colaborador_id(uuid) to authenticated;
grant execute on function public.get_coordenador_id(uuid) to authenticated;
grant execute on function public.colaborador_coordenador_id(uuid) to authenticated;

-- =====================================================================
-- 11. TRIGGERS DE REGRA DE NEGÓCIO EM LANÇAMENTOS
-- =====================================================================

-- Ao inserir: força status inicial e limpa campos de decisão,
-- não importa o que o cliente tenha enviado (defesa em profundidade,
-- além da RLS).
create or replace function public.trg_lancamentos_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'pendente';
  new.enviado_em := coalesce(new.enviado_em, now());
  new.aprovado_por := null;
  new.decidido_em := null;
  return new;
end;
$$;

create trigger trg_lancamentos_bi before insert on public.lancamentos
  for each row execute function public.trg_lancamentos_before_insert();

-- Ao atualizar: coordenador só pode mudar o status (de pendente para
-- aprovado/recusado) de lançamentos da própria equipe, e não pode
-- alterar mais nada do registro. RH pode editar livremente.
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
      new.aprovado_por := v_uid;
      new.decidido_em := now();
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
    return new;
  end if;

  raise exception 'sem permissão para alterar este lançamento';
end;
$$;

create trigger trg_lancamentos_bu before update on public.lancamentos
  for each row execute function public.trg_lancamentos_before_update();

-- Histórico automático a cada criação/decisão de lançamento.
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
    insert into public.historico (lancamento_id, acao, usuario_id)
    values (new.id, 'status_alterado_para_' || new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_lancamentos_hist_insert after insert on public.lancamentos
  for each row execute function public.trg_lancamentos_historico();
create trigger trg_lancamentos_hist_update after update on public.lancamentos
  for each row execute function public.trg_lancamentos_historico();

-- =====================================================================
-- 12. ROW LEVEL SECURITY — habilitar em todas as tabelas
-- =====================================================================

alter table public.rh_usuarios      enable row level security;
alter table public.coordenadores    enable row level security;
alter table public.colaboradores    enable row level security;
alter table public.lancamentos      enable row level security;
alter table public.aceites          enable row level security;
alter table public.historico        enable row level security;
alter table public.log_acesso       enable row level security;
alter table public.feriados         enable row level security;

alter table public.rh_usuarios      force row level security;
alter table public.coordenadores    force row level security;
alter table public.colaboradores    force row level security;
alter table public.lancamentos      force row level security;
alter table public.aceites          force row level security;
alter table public.historico        force row level security;
alter table public.log_acesso       force row level security;
alter table public.feriados         force row level security;

-- =====================================================================
-- 13. GRANTS DE BASE (defesa em profundidade além do RLS)
-- -----------------------------------------------------------------------
-- Revoga tudo do público/anon e concede só o necessário para
-- "authenticated". UPDATE/DELETE de historico e log_acesso nunca são
-- concedidos: nem a RLS nem o GRANT permitem alterar/apagar.
-- =====================================================================

revoke all on all tables in schema public from anon, public;

grant select, insert, update on public.rh_usuarios      to authenticated;
grant select, insert, update on public.coordenadores    to authenticated;
grant select, insert, update on public.colaboradores    to authenticated;
grant select, insert, update on public.lancamentos      to authenticated;
grant select, insert          on public.aceites          to authenticated;
grant select, insert          on public.historico         to authenticated;
grant select, insert          on public.log_acesso        to authenticated;
grant select                  on public.feriados          to authenticated;
grant insert, update, delete  on public.feriados          to authenticated;

-- =====================================================================
-- 14. POLICIES — rh_usuarios
-- =====================================================================

create policy rh_usuarios_select on public.rh_usuarios
  for select
  using (user_id = auth.uid() or public.is_rh(auth.uid()));

create policy rh_usuarios_insert on public.rh_usuarios
  for insert
  with check (public.is_rh(auth.uid()));

create policy rh_usuarios_update on public.rh_usuarios
  for update
  using (public.is_rh(auth.uid()))
  with check (public.is_rh(auth.uid()));

-- sem policy de delete = ninguém apaga via API.

-- =====================================================================
-- 15. POLICIES — coordenadores
-- =====================================================================

create policy coordenadores_select on public.coordenadores
  for select
  using (user_id = auth.uid() or public.is_rh(auth.uid()));

create policy coordenadores_insert on public.coordenadores
  for insert
  with check (public.is_rh(auth.uid()));

create policy coordenadores_update on public.coordenadores
  for update
  using (public.is_rh(auth.uid()))
  with check (public.is_rh(auth.uid()));

-- =====================================================================
-- 16. POLICIES — colaboradores
-- =====================================================================

create policy colaboradores_select on public.colaboradores
  for select
  using (
    user_id = auth.uid()
    or coordenador_id = public.get_coordenador_id(auth.uid())
    or public.is_rh(auth.uid())
  );

create policy colaboradores_insert on public.colaboradores
  for insert
  with check (public.is_rh(auth.uid()));

create policy colaboradores_update on public.colaboradores
  for update
  using (public.is_rh(auth.uid()))
  with check (public.is_rh(auth.uid()));

-- =====================================================================
-- 17. POLICIES — lancamentos
-- =====================================================================

create policy lancamentos_select on public.lancamentos
  for select
  using (
    colaborador_id = public.get_colaborador_id(auth.uid())
    or public.colaborador_coordenador_id(colaborador_id) = public.get_coordenador_id(auth.uid())
    or public.is_rh(auth.uid())
  );

create policy lancamentos_insert_colaborador on public.lancamentos
  for insert
  with check (
    origem = 'colaborador'
    and colaborador_id = public.get_colaborador_id(auth.uid())
  );

create policy lancamentos_insert_rh on public.lancamentos
  for insert
  with check (
    origem = 'rh_manual'
    and public.is_rh(auth.uid())
  );

create policy lancamentos_update_coordenador on public.lancamentos
  for update
  using (
    public.colaborador_coordenador_id(colaborador_id) = public.get_coordenador_id(auth.uid())
    and status = 'pendente'
  )
  with check (
    public.colaborador_coordenador_id(colaborador_id) = public.get_coordenador_id(auth.uid())
  );

create policy lancamentos_update_rh on public.lancamentos
  for update
  using (public.is_rh(auth.uid()))
  with check (public.is_rh(auth.uid()));

-- Colaborador não tem policy de update nem de delete: não edita nem
-- apaga depois de enviado. Ninguém tem policy de delete.

-- =====================================================================
-- 18. POLICIES — aceites
-- =====================================================================

create policy aceites_select on public.aceites
  for select
  using (
    exists (
      select 1 from public.lancamentos l
      where l.id = lancamento_id
        and (
          l.colaborador_id = public.get_colaborador_id(auth.uid())
          or public.colaborador_coordenador_id(l.colaborador_id) = public.get_coordenador_id(auth.uid())
          or public.is_rh(auth.uid())
        )
    )
  );

create policy aceites_insert on public.aceites
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.lancamentos l
      where l.id = lancamento_id
        and (
          l.colaborador_id = public.get_colaborador_id(auth.uid())
          or public.is_rh(auth.uid())
        )
    )
  );

-- sem update/delete: aceite é imutável.

-- =====================================================================
-- 19. POLICIES — historico (somente inserção, nunca alteração/exclusão)
-- =====================================================================

create policy historico_select on public.historico
  for select
  using (
    exists (
      select 1 from public.lancamentos l
      where l.id = lancamento_id
        and (
          l.colaborador_id = public.get_colaborador_id(auth.uid())
          or public.colaborador_coordenador_id(l.colaborador_id) = public.get_coordenador_id(auth.uid())
          or public.is_rh(auth.uid())
        )
    )
  );

-- Insert direto (fora do trigger automático) só para o RH registrar
-- uma justificativa manual.
create policy historico_insert_rh on public.historico
  for insert
  with check (public.is_rh(auth.uid()) and usuario_id = auth.uid());

-- sem update/delete para ninguém, em nenhuma hipótese.

-- =====================================================================
-- 20. POLICIES — log_acesso
-- =====================================================================

create policy log_acesso_select on public.log_acesso
  for select
  using (public.is_rh(auth.uid()));

create policy log_acesso_insert on public.log_acesso
  for insert
  with check (usuario_id = auth.uid());

-- sem update/delete: log é imutável.

-- =====================================================================
-- 21. POLICIES — feriados
-- =====================================================================

create policy feriados_select on public.feriados
  for select
  using (auth.uid() is not null);

create policy feriados_insert on public.feriados
  for insert
  with check (public.is_rh(auth.uid()));

create policy feriados_update on public.feriados
  for update
  using (public.is_rh(auth.uid()))
  with check (public.is_rh(auth.uid()));

create policy feriados_delete on public.feriados
  for delete
  using (public.is_rh(auth.uid()));

-- =====================================================================
-- 22. INDICADOR DE EXCESSO DE JORNADA — só RH, nunca trafega para
-- colaborador/coordenador
-- -----------------------------------------------------------------------
-- Implementado como função SECURITY DEFINER (RPC), não como view/tabela
-- comum: se quem chamar não for RH, a função nega o acesso antes de
-- montar qualquer linha de retorno. Assim o dado nem chega a existir
-- na resposta para quem não é RH — não é uma coluna escondida por
-- policy, é uma barreira que barra a consulta inteira.
-- Ajuste o limite (horas/mês) conforme a política do colégio.
-- =====================================================================

create or replace function public.rh_indicador_excesso_jornada(
  p_limite_horas_mes numeric default 50
)
returns table (
  colaborador_id     uuid,
  nome_completo      text,
  matricula          text,
  mes_referencia     date,
  total_horas_mes    numeric,
  excesso            boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_rh(auth.uid()) then
    raise exception 'acesso negado: indicador restrito ao RH';
  end if;

  return query
  select
    c.id,
    c.nome_completo,
    c.matricula,
    date_trunc('month', l.data_hora_extra)::date as mes_referencia,
    round(sum(extract(epoch from l.duracao_calculada)) / 3600.0, 2) as total_horas_mes,
    (round(sum(extract(epoch from l.duracao_calculada)) / 3600.0, 2) > p_limite_horas_mes) as excesso
  from public.lancamentos l
  join public.colaboradores c on c.id = l.colaborador_id
  where l.status = 'aprovado'
  group by c.id, c.nome_completo, c.matricula, date_trunc('month', l.data_hora_extra);
end;
$$;

grant execute on function public.rh_indicador_excesso_jornada(numeric) to authenticated;

-- =====================================================================
-- Fim do script.
-- =====================================================================
