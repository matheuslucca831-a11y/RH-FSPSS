-- =====================================================================
-- SIGER RH | FSPSS
-- 001_estrutura.sql: rodar inteiro no SQL Editor do Supabase (depois do 000)
--
-- Papéis de acesso:
--   funcionario  faz solicitações e acompanha as suas
--   chefia       (enfermeiro/supervisor) analisa as solicitações da sua unidade
--   direcao      decisão final das folgas, acompanha tudo, relatórios e cadastros
--
-- Fluxo:
--   Ajuste de ponto: Funcionário > Chefia > Concluído
--   Folga:           Funcionário > Chefia > Direção > Concluído
--   (Pedido da própria chefia vai direto para a Direção)
--
-- Segurança (resumo):
--   * Todas as tabelas com RLS; o site nunca altera uma solicitação direto,
--     só pelas funções do fluxo, que conferem quem pode fazer o quê.
--   * Acesso só depois de trocar a senha inicial (deve_trocar_senha).
--   * Direção só acessa com verificação em duas etapas (aal2), configurável.
--   * Comprovantes em bucket privado; só abrem pela Edge Function rh-comprovante,
--     que confere a permissão e registra quem abriu.
--   * Trilha de auditoria somente leitura (nem a Direção apaga).
--   * Usuário anônimo (sem login) não tem nenhum privilégio no schema public.
-- =====================================================================

create extension if not exists pgcrypto;

-- ====================== CONFIGURAÇÃO DE SEGURANÇA =====================
create table public.seguranca_config (
  id                   boolean primary key default true check (id),   -- uma linha só
  exigir_mfa_direcao   boolean not null default true,
  exigir_mfa_chefia    boolean not null default false,
  minutos_inatividade  int not null default 30 check (minutos_inatividade between 5 and 480),
  limite_pedidos_dia   int not null default 20 check (limite_pedidos_dia between 1 and 200),
  atualizado_em        timestamptz not null default now()
);
insert into public.seguranca_config default values;

-- =========================== CADASTROS BASE ===========================
create table public.unidades (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique check (length(trim(nome)) between 2 and 120),
  sigla      text check (length(sigla) <= 20),
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table public.perfis (
  id                 uuid primary key references auth.users(id) on delete cascade,
  nome               text not null check (length(trim(nome)) between 2 and 150),
  matricula          text not null unique check (matricula ~ '^[A-Za-z0-9._]{1,40}$'),
  email              text,
  cargo              text check (length(cargo) <= 120),
  papel              text not null default 'funcionario' check (papel in ('funcionario','chefia','direcao')),
  unidade_id         uuid references public.unidades(id),
  ativo              boolean not null default true,
  deve_trocar_senha  boolean not null default true,
  senha_trocada_em   timestamptz,
  ultimo_acesso_em   timestamptz,
  criado_em          timestamptz not null default now(),
  constraint perfil_unidade_ck check (papel = 'direcao' or unidade_id is not null)
);
create index perfis_unidade_idx on public.perfis (unidade_id);

-- ======================= FUNÇÕES DE APOIO (RLS) =======================
-- O nível de verificação da sessão atende ao exigido para o papel?
create or replace function public.mfa_ok(p_papel text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
      or not coalesce((select case p_papel when 'direcao' then exigir_mfa_direcao
                                           when 'chefia'  then exigir_mfa_chefia
                                           else false end
                       from seguranca_config), true);
$$;

-- "Liberado" = ativo, já trocou a senha inicial e tem o nível de verificação exigido
create or replace function public.usuario_ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis
                 where id = auth.uid() and ativo and not deve_trocar_senha and mfa_ok(papel));
$$;

create or replace function public.is_direcao() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis
                 where id = auth.uid() and ativo and not deve_trocar_senha and papel = 'direcao' and mfa_ok(papel));
$$;

create or replace function public.is_chefia() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis
                 where id = auth.uid() and ativo and not deve_trocar_senha and papel = 'chefia' and mfa_ok(papel));
$$;

create or replace function public.minha_unidade() returns uuid
language sql stable security definer set search_path = public as $$
  select unidade_id from perfis
  where id = auth.uid() and ativo and not deve_trocar_senha and mfa_ok(papel);
$$;

-- O que o site precisa saber logo depois do login (antes de liberar as telas)
create or replace function public.minha_seguranca() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ativo', p.ativo,
    'papel', p.papel,
    'deve_trocar_senha', p.deve_trocar_senha,
    'mfa_exigido', coalesce(case p.papel when 'direcao' then c.exigir_mfa_direcao when 'chefia' then c.exigir_mfa_chefia else false end, p.papel = 'direcao'),
    'mfa_ok', mfa_ok(p.papel),
    'minutos_inatividade', coalesce(c.minutos_inatividade, 30),
    -- o próprio perfil vem junto: o site usa esta única resposta para decidir tudo
    'perfil', json_build_object(
      'id', p.id, 'nome', p.nome, 'matricula', p.matricula, 'email', p.email, 'cargo', p.cargo,
      'papel', p.papel, 'unidade_id', p.unidade_id, 'ativo', p.ativo,
      'unidade', (select json_build_object('nome', u.nome, 'sigla', u.sigla) from unidades u where u.id = p.unidade_id)))
  from perfis p
  left join seguranca_config c on true
  where p.id = auth.uid();
$$;

-- ============================== AUDITORIA =============================
-- Somente leitura para a Direção; ninguém altera nem apaga (nem pelo site, nem pelo SQL comum).
create table public.auditoria (
  id            bigint generated always as identity primary key,
  criado_em     timestamptz not null default now(),
  usuario_id    uuid,
  usuario_nome  text,
  acao          text not null,
  alvo_tipo     text,
  alvo_id       text,
  alvo_nome     text,
  detalhe       jsonb
);
create index auditoria_data_idx on public.auditoria (criado_em desc);
create index auditoria_alvo_idx on public.auditoria (alvo_tipo, alvo_id);

create or replace function public.tg_auditoria_imutavel() returns trigger
language plpgsql as $$
begin
  raise exception 'A auditoria não pode ser alterada nem apagada';
end $$;
create trigger auditoria_imutavel before update or delete on public.auditoria
  for each row execute function public.tg_auditoria_imutavel();

create or replace function public.registrar_auditoria(p_acao text, p_alvo_tipo text default null, p_alvo_id text default null,
                                                      p_alvo_nome text default null, p_detalhe jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into auditoria (usuario_id, usuario_nome, acao, alvo_tipo, alvo_id, alvo_nome, detalhe)
  values (auth.uid(), coalesce((select nome from perfis where id = auth.uid()), 'Sistema'),
          p_acao, p_alvo_tipo, p_alvo_id, p_alvo_nome, p_detalhe);
$$;

-- Diferença entre duas versões de uma linha (só os campos que mudaram)
create or replace function public.diferenca(p_antes jsonb, p_depois jsonb, p_ignorar text[] default '{}')
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('antes', p_antes->k, 'depois', p_depois->k)), '{}'::jsonb)
  from jsonb_object_keys(coalesce(p_depois, p_antes)) k
  where not (k = any(p_ignorar)) and (p_antes->k) is distinct from (p_depois->k);
$$;

-- Nunca deixa o sistema sem Direção; ninguém muda o próprio acesso
create or replace function public.tg_perfis_protecao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.id = auth.uid() and (tg_op = 'DELETE' or new.papel <> old.papel or not new.ativo) then
    raise exception 'Você não pode mudar o seu próprio tipo de acesso nem desativar a si mesmo';
  end if;
  if (tg_op = 'DELETE' and old.papel = 'direcao' and old.ativo)
     or (tg_op = 'UPDATE' and old.papel = 'direcao' and old.ativo and (new.papel <> 'direcao' or not new.ativo)) then
    if not exists (select 1 from perfis where papel = 'direcao' and ativo and id <> old.id) then
      raise exception 'O sistema precisa de pelo menos um acesso de Direção ativo';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger perfis_protecao before update or delete on public.perfis
  for each row execute function public.tg_perfis_protecao();

-- A Edge Function (chave secreta) registra ela mesma, com o nome de quem pediu
create or replace function public.pela_edge_function() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', '') = 'service_role';
$$;

create or replace function public.tg_perfis_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if pela_edge_function() then return null; end if;
  if tg_op = 'INSERT' then
    perform registrar_auditoria('Acesso criado', 'perfil', new.id::text, new.nome,
      jsonb_build_object('matricula', new.matricula, 'papel', new.papel, 'unidade_id', new.unidade_id));
  elsif tg_op = 'DELETE' then
    perform registrar_auditoria('Acesso removido', 'perfil', old.id::text, old.nome, to_jsonb(old) - 'email');
  else
    d := diferenca(to_jsonb(old), to_jsonb(new), array['ultimo_acesso_em','senha_trocada_em','deve_trocar_senha']);
    if d <> '{}'::jsonb then
      perform registrar_auditoria(
        case when old.ativo and not new.ativo then 'Acesso desativado'
             when not old.ativo and new.ativo then 'Acesso reativado'
             else 'Acesso alterado' end,
        'perfil', new.id::text, new.nome, d);
    end if;
  end if;
  return null;
end $$;
create trigger perfis_auditoria after insert or update or delete on public.perfis
  for each row execute function public.tg_perfis_auditoria();

create or replace function public.tg_unidades_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform registrar_auditoria(
    case tg_op when 'INSERT' then 'Unidade criada' when 'DELETE' then 'Unidade removida' else 'Unidade alterada' end,
    'unidade', coalesce(new.id, old.id)::text, coalesce(new.nome, old.nome),
    case tg_op when 'UPDATE' then diferenca(to_jsonb(old), to_jsonb(new)) else null end);
  return null;
end $$;
create trigger unidades_auditoria after insert or update or delete on public.unidades
  for each row execute function public.tg_unidades_auditoria();

create or replace function public.tg_config_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  perform registrar_auditoria('Configuração de segurança alterada', 'configuracao', null, null,
    diferenca(to_jsonb(old), to_jsonb(new), array['atualizado_em']));
  return new;
end $$;
create trigger config_auditoria before update on public.seguranca_config
  for each row execute function public.tg_config_auditoria();

-- Login e troca de senha (registrados pelo próprio Supabase Auth, não pelo site)
create or replace function public.tg_auth_eventos() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  select nome into v_nome from perfis where id = new.id;
  if v_nome is null then return new; end if;
  if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
    update perfis set ultimo_acesso_em = new.last_sign_in_at where id = new.id;
    insert into auditoria (usuario_id, usuario_nome, acao, alvo_tipo, alvo_id, alvo_nome)
    values (new.id, v_nome, 'Entrou no sistema', 'perfil', new.id::text, v_nome);
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    -- A Edge Function marca de novo "deve trocar" quando é a Direção que redefine
    update perfis set deve_trocar_senha = false, senha_trocada_em = now() where id = new.id;
    insert into auditoria (usuario_id, usuario_nome, acao, alvo_tipo, alvo_id, alvo_nome)
    values (new.id, v_nome, 'Senha alterada', 'perfil', new.id::text, v_nome);
  end if;
  return new;
end $$;
create trigger rh_auth_eventos after update on auth.users
  for each row execute function public.tg_auth_eventos();

-- ======================= NUMERAÇÃO SEQUENCIAL ANUAL ===================
create table public.contadores (
  chave   text not null,
  ano     int  not null,
  ultimo  int  not null default 0,
  primary key (chave, ano)
);

create or replace function public.proximo_numero(p_chave text, p_ano int) returns int
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into contadores (chave, ano, ultimo) values (p_chave, p_ano, 1)
  on conflict (chave, ano) do update set ultimo = contadores.ultimo + 1
  returning ultimo into v;
  return v;
end $$;

create or replace function public.ano_atual() returns int
language sql stable as $$ select extract(year from (now() at time zone 'America/Sao_Paulo'))::int $$;

-- ============================ SOLICITAÇÕES ============================
create table public.solicitacoes (
  id                     uuid primary key default gen_random_uuid(),
  protocolo              text unique,                     -- AAAA-NNNN (automático)
  categoria              text not null check (categoria in ('ponto','folga')),
  tipo                   text not null,
  subtipo                text,
  precisa_direcao        boolean generated always as (categoria = 'folga') stored,

  data_inicio            date not null,
  data_fim               date not null,
  entrada                time,
  saida_almoco           time,
  retorno_almoco         time,
  saida                  time,
  justificativa          text check (length(justificativa) <= 2000),
  anexo_bucket           text not null default 'comprovantes' check (anexo_bucket in ('comprovantes','anexos')),
  anexo_path             text check (length(anexo_path) <= 300),
  anexo_nome             text check (length(anexo_nome) <= 200),

  -- cópias no momento do pedido (preenchidas pelo banco)
  solicitante_id         uuid not null references public.perfis(id),
  solicitante_nome       text not null default '',
  solicitante_matricula  text,
  solicitante_cargo      text,
  unidade_id             uuid references public.unidades(id),
  unidade_nome           text,

  situacao               text not null default 'Aguardando chefia' check (situacao in
                           ('Aguardando chefia','Aguardando direção','Aprovado','Negado','Cancelado')),

  chefia_decisao         text check (chefia_decisao in ('Aprovado','Negado')),
  chefia_por             uuid references public.perfis(id),
  chefia_nome            text,
  chefia_em              timestamptz,
  chefia_obs             text check (length(chefia_obs) <= 1000),

  direcao_decisao        text check (direcao_decisao in ('Aprovado','Negado')),
  direcao_por            uuid references public.perfis(id),
  direcao_nome           text,
  direcao_em             timestamptz,
  direcao_obs            text check (length(direcao_obs) <= 1000),

  cancelado_em           timestamptz,
  arquivado              boolean not null default false,
  arquivado_em           timestamptz,
  id_antigo              text,                            -- usado só na importação do sistema antigo

  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),

  constraint periodo_ck check (data_fim >= data_inicio and data_fim - data_inicio <= 366),
  constraint tipo_por_categoria_ck check (
       (categoria = 'ponto' and tipo in ('Esquecimento','Atestado','Erro no relógio','Outros'))
    or (categoria = 'folga' and tipo in ('Banco de horas','Folga abonada (Art. 56, XII)','Serviço eleitoral (TRE)',
                                         'Campanha de vacinação','Abono natalício (Art. 56, X)','Outros'))
  ),
  constraint subtipo_ck check (
    (tipo = 'Atestado' and subtipo in ('Médico','Acompanhante','Comparecimento','Doação de sangue'))
    or (tipo <> 'Atestado' and subtipo is null)
  ),
  constraint arquivo_so_finalizado_ck check (not arquivado or situacao in ('Aprovado','Negado','Cancelado'))
);
create index solicitacoes_unidade_idx     on public.solicitacoes (unidade_id, situacao);
create index solicitacoes_solicitante_idx on public.solicitacoes (solicitante_id, criado_em desc);
create index solicitacoes_situacao_idx    on public.solicitacoes (situacao) where not arquivado;
create index solicitacoes_periodo_idx     on public.solicitacoes (data_inicio);
create index solicitacoes_anexo_idx       on public.solicitacoes (anexo_bucket, anexo_path) where anexo_path is not null;

-- ============================== HISTÓRICO =============================
create table public.historico (
  id              bigint generated always as identity primary key,
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  acao            text not null,
  detalhe         text,
  usuario_id      uuid,
  usuario_nome    text,
  criado_em       timestamptz not null default now()
);
create index historico_solicitacao_idx on public.historico (solicitacao_id, criado_em);

create or replace function public.registrar_historico(p_id uuid, p_acao text, p_detalhe text default null)
returns void language sql security definer set search_path = public as $$
  insert into historico (solicitacao_id, acao, detalhe, usuario_id, usuario_nome)
  values (p_id, p_acao, nullif(trim(p_detalhe), ''), auth.uid(), (select nome from perfis where id = auth.uid()));
$$;

-- =============================== TRIGGERS =============================
-- Nova solicitação: quem pediu, unidade, protocolo, situação inicial e validações
create or replace function public.tg_solicitacao_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; v_ano int := ano_atual(); v_hoje int;
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  select * into p from perfis where id = auth.uid();

  -- Freio contra envio em massa
  select count(*) into v_hoje from solicitacoes
   where solicitante_id = p.id and criado_em > now() - interval '24 hours';
  if v_hoje >= (select limite_pedidos_dia from seguranca_config) then
    raise exception 'Limite de solicitações em 24 horas atingido. Tente de novo amanhã ou procure a sua chefia';
  end if;

  new.solicitante_id        := p.id;
  new.solicitante_nome      := p.nome;
  new.solicitante_matricula := p.matricula;
  new.solicitante_cargo     := p.cargo;
  new.unidade_id            := p.unidade_id;
  new.unidade_nome          := (select nome from unidades where id = p.unidade_id);

  -- Pedido da chefia ou da Direção não passa pela chefia (ninguém analisa o próprio pedido)
  new.situacao := case when p.papel = 'funcionario' then 'Aguardando chefia' else 'Aguardando direção' end;

  new.data_fim := coalesce(new.data_fim, new.data_inicio);
  new.justificativa := nullif(trim(new.justificativa), '');

  -- Horários só fazem sentido no ajuste de ponto (exceto atestado)
  if new.categoria = 'folga' or new.tipo = 'Atestado' then
    new.entrada := null; new.saida_almoco := null; new.retorno_almoco := null; new.saida := null;
  elsif coalesce(new.entrada, new.saida_almoco, new.retorno_almoco, new.saida) is null then
    raise exception 'Informe pelo menos um horário para o ajuste de ponto';
  end if;

  if (new.tipo = 'Atestado' or new.tipo = 'Serviço eleitoral (TRE)') and new.anexo_path is null then
    raise exception 'Este tipo de solicitação precisa do comprovante anexado';
  end if;
  new.anexo_bucket := 'comprovantes';
  if new.anexo_path is not null then
    -- só aceita arquivo que a própria pessoa enviou para a pasta dela
    if split_part(new.anexo_path, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'comprovantes' and o.name = new.anexo_path)
       or exists (select 1 from solicitacoes s where s.anexo_bucket = 'comprovantes' and s.anexo_path = new.anexo_path) then
      raise exception 'Anexo inválido';
    end if;
  end if;
  if new.tipo = 'Outros' and new.justificativa is null then
    raise exception 'Explique o motivo na justificativa';
  end if;

  new.chefia_decisao := null; new.chefia_por := null; new.chefia_nome := null; new.chefia_em := null; new.chefia_obs := null;
  new.direcao_decisao := null; new.direcao_por := null; new.direcao_nome := null; new.direcao_em := null; new.direcao_obs := null;
  new.cancelado_em := null; new.arquivado := false; new.arquivado_em := null; new.id_antigo := null;
  new.protocolo := v_ano || '-' || lpad(proximo_numero('protocolo', v_ano)::text, 4, '0');
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end $$;

create trigger solicitacoes_insert before insert on public.solicitacoes
  for each row execute function public.tg_solicitacao_insert();

create or replace function public.tg_solicitacao_criada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform registrar_historico(new.id,
    case when new.situacao = 'Aguardando direção' then 'Solicitação enviada direto à Direção' else 'Solicitação enviada' end);
  return null;
end $$;

create trigger solicitacoes_criada after insert on public.solicitacoes
  for each row execute function public.tg_solicitacao_criada();

create or replace function public.tg_atualizado_em() returns trigger
language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;

create trigger solicitacoes_atualizado before update on public.solicitacoes
  for each row execute function public.tg_atualizado_em();

-- Exclusão definitiva fica registrada na auditoria (o histórico vai junto com a solicitação)
create or replace function public.tg_solicitacao_excluida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform registrar_auditoria('Solicitação excluída', 'solicitacao', old.id::text, old.protocolo,
    jsonb_build_object('solicitante', old.solicitante_nome, 'matricula', old.solicitante_matricula,
                       'tipo', old.tipo, 'periodo', old.data_inicio || ' a ' || old.data_fim,
                       'situacao', old.situacao, 'tinha_anexo', old.anexo_path is not null));
  return null;
end $$;
create trigger solicitacoes_excluida after delete on public.solicitacoes
  for each row execute function public.tg_solicitacao_excluida();

-- ===================== FUNÇÕES DO FLUXO (chamadas pelo site) ==========
-- O site nunca altera uma solicitação direto: tudo passa por estas funções,
-- que conferem quem pode fazer o quê e registram no histórico.

-- Chefia imediata aprova ou nega (folga aprovada segue para a Direção)
create or replace function public.decidir_chefia(p_id uuid, p_aprovar boolean, p_obs text default null)
returns text language plpgsql security definer set search_path = public as $$
declare s solicitacoes; v_nova text; v_obs text := left(nullif(trim(p_obs), ''), 1000);
begin
  if not is_chefia() then raise exception 'Somente a chefia da unidade pode analisar'; end if;
  select * into s from solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if s.unidade_id is distinct from minha_unidade() then raise exception 'Esta solicitação não é da sua unidade'; end if;
  if s.solicitante_id = auth.uid() then raise exception 'Você não pode analisar a sua própria solicitação'; end if;
  if s.situacao <> 'Aguardando chefia' then raise exception 'Esta solicitação já foi analisada'; end if;
  if not p_aprovar and v_obs is null then raise exception 'Informe o motivo da negativa'; end if;

  v_nova := case when not p_aprovar then 'Negado' when s.precisa_direcao then 'Aguardando direção' else 'Aprovado' end;

  update solicitacoes set
    situacao = v_nova,
    chefia_decisao = case when p_aprovar then 'Aprovado' else 'Negado' end,
    chefia_por = auth.uid(), chefia_nome = (select nome from perfis where id = auth.uid()),
    chefia_em = now(), chefia_obs = v_obs
  where id = p_id;

  perform registrar_historico(p_id,
    case v_nova when 'Negado' then 'Negada pela chefia'
                when 'Aguardando direção' then 'Aprovada pela chefia e enviada à Direção'
                else 'Aprovada pela chefia' end,
    v_obs);
  return v_nova;
end $$;

-- Direção dá a decisão final (também pode decidir o que ainda está na chefia)
create or replace function public.decidir_direcao(p_id uuid, p_aprovar boolean, p_obs text default null)
returns text language plpgsql security definer set search_path = public as $$
declare s solicitacoes; v_nova text; v_obs text := left(nullif(trim(p_obs), ''), 1000);
begin
  if not is_direcao() then raise exception 'Somente a Direção pode dar a decisão final'; end if;
  select * into s from solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if s.solicitante_id = auth.uid() then raise exception 'Você não pode decidir a sua própria solicitação'; end if;
  if s.situacao not in ('Aguardando chefia','Aguardando direção') then raise exception 'Esta solicitação já foi finalizada'; end if;
  if not p_aprovar and v_obs is null then raise exception 'Informe o motivo da negativa'; end if;

  v_nova := case when p_aprovar then 'Aprovado' else 'Negado' end;

  update solicitacoes set
    situacao = v_nova,
    direcao_decisao = v_nova,
    direcao_por = auth.uid(), direcao_nome = (select nome from perfis where id = auth.uid()),
    direcao_em = now(), direcao_obs = v_obs
  where id = p_id;

  perform registrar_historico(p_id,
    (case when p_aprovar then 'Aprovada' else 'Negada' end) || ' pela Direção'
      || case when s.situacao = 'Aguardando chefia' then ' (sem passar pela chefia)' else '' end,
    v_obs);
  return v_nova;
end $$;

-- Quem pediu pode cancelar enquanto não houver decisão final
create or replace function public.cancelar_solicitacao(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s solicitacoes;
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  select * into s from solicitacoes where id = p_id for update;
  if not found or s.solicitante_id <> auth.uid() then
    raise exception 'Solicitação não encontrada';
  end if;
  if s.situacao not in ('Aguardando chefia','Aguardando direção') then
    raise exception 'Só dá para cancelar enquanto a solicitação está em análise';
  end if;
  update solicitacoes set situacao = 'Cancelado', cancelado_em = now() where id = p_id;
  perform registrar_historico(p_id, 'Cancelada por quem pediu', left(p_motivo, 500));
end $$;

-- Direção arquiva / restaura solicitações finalizadas
create or replace function public.arquivar_solicitacao(p_id uuid, p_arquivar boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare s solicitacoes;
begin
  if not is_direcao() then raise exception 'Somente a Direção pode arquivar'; end if;
  select * into s from solicitacoes where id = p_id for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if p_arquivar and s.situacao not in ('Aprovado','Negado','Cancelado') then
    raise exception 'Só dá para arquivar solicitações finalizadas';
  end if;
  if s.arquivado = p_arquivar then return; end if;
  update solicitacoes set arquivado = p_arquivar, arquivado_em = case when p_arquivar then now() end where id = p_id;
  perform registrar_historico(p_id, case when p_arquivar then 'Arquivada' else 'Restaurada do arquivo' end);
end $$;

-- Quem pode ver uma solicitação
create or replace function public.pode_ver_solicitacao(p_solicitante uuid, p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select usuario_ativo() and (
    p_solicitante = auth.uid()
    or is_direcao()
    or (is_chefia() and p_unidade = minha_unidade())
  );
$$;

-- ======================== REGRAS DE ACESSO (RLS) ======================
alter table public.seguranca_config  enable row level security;
alter table public.unidades          enable row level security;
alter table public.perfis            enable row level security;
alter table public.solicitacoes      enable row level security;
alter table public.historico         enable row level security;
alter table public.auditoria         enable row level security;
alter table public.contadores        enable row level security;   -- sem políticas: só via funções

create policy config_ler     on public.seguranca_config for select to authenticated using (is_direcao());
create policy config_direcao on public.seguranca_config for update to authenticated using (is_direcao()) with check (is_direcao());

-- Unidades: todos os liberados leem; só a Direção altera
create policy unidades_ler     on public.unidades for select to authenticated using (usuario_ativo());
create policy unidades_direcao on public.unidades for all    to authenticated using (is_direcao()) with check (is_direcao());

-- Perfis: cada um lê o próprio (mesmo antes de liberar, para o site saber o que pedir);
-- chefia lê a equipe da unidade; Direção lê e altera (criar e excluir só pela Edge Function)
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or is_direcao() or (is_chefia() and unidade_id = minha_unidade()));
create policy perfis_direcao on public.perfis for update to authenticated
  using (is_direcao()) with check (is_direcao());

-- Solicitações: inserir (o banco completa quem pediu); ler conforme o papel; excluir só a Direção.
-- Não há política de UPDATE: mudanças só pelas funções do fluxo.
create policy solicitacoes_ler on public.solicitacoes for select to authenticated
  using (pode_ver_solicitacao(solicitante_id, unidade_id));
create policy solicitacoes_inserir on public.solicitacoes for insert to authenticated
  with check (usuario_ativo());
create policy solicitacoes_excluir on public.solicitacoes for delete to authenticated
  using (is_direcao());

create policy historico_ler on public.historico for select to authenticated
  using (exists (select 1 from solicitacoes s where s.id = solicitacao_id));

create policy auditoria_ler on public.auditoria for select to authenticated using (is_direcao());

-- Derruba as sessões abertas de alguém (usada pela Edge Function ao desativar,
-- redefinir senha ou liberar novo celular). Só a chave secreta executa.
create or replace function public.encerrar_sessoes(p_usuario uuid) returns void
language plpgsql security definer set search_path = auth, public as $$
begin
  delete from auth.refresh_tokens where user_id = p_usuario::text;
  delete from auth.sessions where user_id = p_usuario;
end $$;

-- ======================= PRIVILÉGIOS (defesa extra) ====================
-- Sem login: nada. Com login: só o necessário, coluna por coluna onde dá.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.unidades, public.perfis, public.solicitacoes, public.historico, public.auditoria,
                public.seguranca_config to authenticated;
grant insert, update on public.unidades to authenticated;
grant update (nome, cargo, papel, unidade_id, ativo, deve_trocar_senha) on public.perfis to authenticated;
grant insert (categoria, tipo, subtipo, data_inicio, data_fim, entrada, saida_almoco, retorno_almoco, saida,
              justificativa, anexo_path, anexo_nome) on public.solicitacoes to authenticated;
grant delete on public.solicitacoes to authenticated;
grant update (exigir_mfa_direcao, exigir_mfa_chefia, minutos_inatividade, limite_pedidos_dia)
  on public.seguranca_config to authenticated;

-- Funções que o site chama e as que as regras de acesso usam
grant execute on function public.decidir_chefia(uuid, boolean, text)      to authenticated;
grant execute on function public.decidir_direcao(uuid, boolean, text)     to authenticated;
grant execute on function public.cancelar_solicitacao(uuid, text)         to authenticated;
grant execute on function public.arquivar_solicitacao(uuid, boolean)      to authenticated;
grant execute on function public.minha_seguranca()                        to authenticated;
grant execute on function public.usuario_ativo()                          to authenticated;
grant execute on function public.is_direcao()                             to authenticated;
grant execute on function public.is_chefia()                              to authenticated;
grant execute on function public.minha_unidade()                          to authenticated;
grant execute on function public.mfa_ok(text)                             to authenticated;
grant execute on function public.pode_ver_solicitacao(uuid, uuid)         to authenticated;

-- A Edge Function usa a chave secreta (service_role) e precisa de acesso total
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ============================ ARQUIVOS (STORAGE) ======================
-- Bucket PRIVADO: atestados são dados de saúde.
-- Cada pessoa só envia para a própria pasta e só vê o que ela mesma enviou.
-- Para chefia e Direção, o arquivo abre pela Edge Function rh-comprovante
-- (confere a permissão, gera link de 60 segundos e registra na auditoria).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 10485760, array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create policy comprovantes_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text
              and array_length(storage.foldername(name), 1) = 1 and public.usuario_ativo());

create policy comprovantes_ver_proprio on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and (storage.foldername(name))[1] = auth.uid()::text and public.usuario_ativo());

-- Dono apaga arquivo que não chegou a ser usado (envio que falhou); Direção apaga ao excluir a solicitação
create policy comprovantes_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'comprovantes' and (
    public.is_direcao()
    or ((storage.foldername(name))[1] = auth.uid()::text and public.usuario_ativo()
        and not exists (select 1 from public.solicitacoes s
                        where s.anexo_bucket = 'comprovantes' and s.anexo_path = objects.name))
  ));
