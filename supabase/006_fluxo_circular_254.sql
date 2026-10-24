-- =====================================================================
-- SIGER RH | FSPSS
-- 006_fluxo_circular_254.sql: fluxo de assinaturas da Circular nº 254/2026
-- (com a retificação e o complemento sobre Farmácia).
-- Rodar inteiro no SQL Editor, depois do 001 e do 005. Pode rodar de novo sem problema.
--
-- QUEM ASSINA O QUÊ
--   Cargos gerais (férias, folgas, ocorrências de ponto, cancelamentos):
--       Enfermeiro responsável + Gerente da unidade (os dois).
--       Supervisor assina no lugar de quem estiver de férias ou afastamento médico.
--       Folga para gozo imediato: na ausência de um, o outro assina sozinho,
--       registrando que a outra chefia está ciente.
--   Farmacêutico e Técnico de Farmácia: basta UMA chefia da unidade
--       (Enfermeiro ou Gerente); Supervisor só se os dois estiverem ausentes.
--   Enfermeiros: Gerente da unidade (Supervisor na ausência do Gerente).
--   Gerentes: Coordenação de Enfermagem avalia (aprova ou nega).
--   Saída antecipada e estágio: Enfermeiro; o Gerente só na ausência dele.
--       Sem Supervisor: com os dois ausentes, o pedido aguarda o retorno.
--   Transferência de lotação: direto à Coordenação / Direção.
--   Folgas, férias e cancelamentos: depois das assinaturas, a Direção dá a decisão final.
--   Supervisor, Coordenação e Direção: os pedidos deles vão direto à Direção.
--
-- AUSÊNCIAS: registradas no sistema (férias ou afastamento médico, com período)
-- liberam o substituto na hora. Sem registro, o substituto pode assinar
-- declarando o motivo da ausência (fica no histórico).
-- =====================================================================

begin;

-- ============================ PAPÉIS =================================
-- Remove as regras antigas de papel/unidade (os nomes variam conforme a versão)
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.perfis'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) ilike '%papel%') loop
    execute format('alter table public.perfis drop constraint %I', r.conname);
  end loop;
end $$;

-- "Chefia" antiga vira Enfermeiro responsável ou Gerente (a Direção confere depois em Administração)
update public.perfis set papel = case
    when cargo ~* 'enfermeir' and cargo !~* '(t[eé]cnic|auxiliar)' then 'enfermeiro'
    else 'gerente' end
 where papel = 'chefia';

alter table public.perfis add constraint perfis_papel_check
  check (papel in ('funcionario','enfermeiro','gerente','supervisor','coordenacao','direcao'));
alter table public.perfis add constraint perfil_unidade_ck
  check (papel in ('direcao','coordenacao','supervisor') or unidade_id is not null);

-- Grupo do cargo de quem pede: decide o caminho das assinaturas
alter table public.perfis add column if not exists grupo_cargo text not null default 'geral';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_grupo_cargo_check') then
    alter table public.perfis add constraint perfis_grupo_cargo_check
      check (grupo_cargo in ('geral','farmacia','enfermeiro','gerente'));
  end if;
end $$;
update public.perfis set grupo_cargo = case
    when papel = 'gerente' or cargo ~* 'gerente' then 'gerente'
    when cargo ~* 'farm' then 'farmacia'
    when papel = 'enfermeiro' or (cargo ~* 'enfermeir' and cargo !~* '(t[eé]cnic|auxiliar)') then 'enfermeiro'
    else 'geral' end
 where grupo_cargo = 'geral';

-- Unidades que cada Supervisor acompanha
create table if not exists public.supervisao (
  supervisor_id uuid not null references public.perfis(id) on delete cascade,
  unidade_id    uuid not null references public.unidades(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (supervisor_id, unidade_id)
);

-- ===================== FUNÇÕES DE APOIO (RLS) ========================
create or replace function public.hoje() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.mfa_ok(p_papel text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
      or not coalesce((select case when p_papel = 'direcao' then exigir_mfa_direcao
                                   when p_papel in ('enfermeiro','gerente','supervisor','coordenacao','chefia') then exigir_mfa_chefia
                                   else false end
                       from seguranca_config), true);
$$;

-- Papel de quem está usando (só se o acesso estiver liberado)
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid() and ativo and not deve_trocar_senha and mfa_ok(papel);
$$;

-- Chefia da unidade = Enfermeiro responsável ou Gerente
create or replace function public.is_chefia() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('enfermeiro','gerente'), false);
$$;

create or replace function public.is_coordenacao() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'coordenacao', false);
$$;

create or replace function public.supervisiona(p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'supervisor', false)
     and exists (select 1 from supervisao where supervisor_id = auth.uid() and unidade_id = p_unidade);
$$;

-- Pode ver o que acontece numa unidade (pedidos, equipe, ausências)?
create or replace function public.ve_unidade(p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_direcao() or is_coordenacao()
      or (is_chefia() and p_unidade = minha_unidade())
      or supervisiona(p_unidade);
$$;

create or replace function public.minha_seguranca() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ativo', p.ativo,
    'papel', p.papel,
    'deve_trocar_senha', p.deve_trocar_senha,
    'mfa_exigido', coalesce(case when p.papel = 'direcao' then c.exigir_mfa_direcao
                                 when p.papel = 'funcionario' then false
                                 else c.exigir_mfa_chefia end, p.papel = 'direcao'),
    'mfa_ok', mfa_ok(p.papel),
    'minutos_inatividade', coalesce(c.minutos_inatividade, 30),
    'perfil', json_build_object(
      'id', p.id, 'nome', p.nome, 'matricula', p.matricula, 'email', p.email, 'cargo', p.cargo,
      'papel', p.papel, 'grupo_cargo', p.grupo_cargo, 'unidade_id', p.unidade_id, 'ativo', p.ativo,
      'unidade', (select json_build_object('nome', u.nome, 'sigla', u.sigla) from unidades u where u.id = p.unidade_id),
      'supervisiona', coalesce((select json_agg(s.unidade_id) from supervisao s where s.supervisor_id = p.id), '[]'::json)))
  from perfis p
  left join seguranca_config c on true
  where p.id = auth.uid();
$$;

-- ============================ AUSÊNCIAS ==============================
create table if not exists public.ausencias (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid not null references public.perfis(id) on delete cascade,
  perfil_nome     text not null,
  papel           text not null,
  unidade_id      uuid references public.unidades(id),
  inicio          date not null,
  fim             date not null,
  motivo          text not null check (motivo in ('Férias','Afastamento médico')),
  observacao      text check (length(observacao) <= 300),
  solicitacao_id  uuid references public.solicitacoes(id) on delete set null,
  registrado_por  uuid references public.perfis(id) on delete set null,
  registrado_nome text,
  criado_em       timestamptz not null default now(),
  constraint ausencia_periodo_ck check (fim >= inicio and fim - inicio <= 366)
);
create index if not exists ausencias_unidade_idx on public.ausencias (unidade_id, papel, inicio, fim);
create index if not exists ausencias_perfil_idx on public.ausencias (perfil_id, inicio);

-- A vaga (Enfermeiro ou Gerente) da unidade está sem ninguém hoje? (férias, afastamento ou ninguém cadastrado)
create or replace function public.vaga_ausente(p_unidade uuid, p_papel text, p_dia date default null) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from perfis p
     where p.unidade_id = p_unidade and p.papel = p_papel and p.ativo
       and not exists (select 1 from ausencias a
                        where a.perfil_id = p.id and coalesce(p_dia, hoje()) between a.inicio and a.fim));
$$;

-- Motivo registrado da ausência de hoje (para o histórico)
create or replace function public.motivo_ausencia(p_unidade uuid, p_papel text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.motivo from ausencias a
      where a.unidade_id = p_unidade and a.papel = p_papel and hoje() between a.inicio and a.fim
      order by a.criado_em desc limit 1),
    'sem ' || case p_papel when 'enfermeiro' then 'Enfermeiro' else 'Gerente' end || ' ativo cadastrado');
$$;

-- Quem pode registrar ou remover a ausência de uma chefia
create or replace function public.pode_gerir_ausencia(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis t
     where t.id = p_perfil and t.papel in ('enfermeiro','gerente')
       and usuario_ativo()
       and (is_direcao() or is_coordenacao()
            or t.id = auth.uid()
            or (meu_papel() = 'gerente' and t.unidade_id = minha_unidade())
            or supervisiona(t.unidade_id)));
$$;

create or replace function public.registrar_ausencia(p_perfil uuid, p_inicio date, p_fim date, p_motivo text, p_obs text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare t perfis; v_id uuid;
begin
  if not pode_gerir_ausencia(p_perfil) then
    raise exception 'Você não pode registrar a ausência desta pessoa';
  end if;
  if p_motivo not in ('Férias','Afastamento médico') then raise exception 'Motivo inválido'; end if;
  if p_fim < p_inicio then raise exception 'A data final é antes da inicial'; end if;
  select * into t from perfis where id = p_perfil;
  insert into ausencias (perfil_id, perfil_nome, papel, unidade_id, inicio, fim, motivo, observacao, registrado_por, registrado_nome)
  values (t.id, t.nome, t.papel, t.unidade_id, p_inicio, p_fim, p_motivo, left(nullif(trim(p_obs), ''), 300),
          auth.uid(), (select nome from perfis where id = auth.uid()))
  returning id into v_id;
  perform registrar_auditoria('Ausência registrada', 'perfil', t.id::text, t.nome,
    jsonb_build_object('motivo', p_motivo, 'inicio', p_inicio, 'fim', p_fim));
  return v_id;
end $$;

create or replace function public.remover_ausencia(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a ausencias;
begin
  select * into a from ausencias where id = p_id;
  if not found or not pode_gerir_ausencia(a.perfil_id) then raise exception 'Ausência não encontrada'; end if;
  delete from ausencias where id = p_id;
  perform registrar_auditoria('Ausência removida', 'perfil', a.perfil_id::text, a.perfil_nome,
    jsonb_build_object('motivo', a.motivo, 'inicio', a.inicio, 'fim', a.fim));
end $$;

-- ========================== SOLICITAÇÕES =============================
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.solicitacoes'::regclass and contype = 'c'
             and (pg_get_constraintdef(oid) ilike '%categoria%' or pg_get_constraintdef(oid) ilike '%situacao%') loop
    execute format('alter table public.solicitacoes drop constraint %I', r.conname);
  end loop;
end $$;

-- "precisa_direcao" deixa de ser calculada só pela categoria
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'solicitacoes'
              and column_name = 'precisa_direcao' and is_generated = 'ALWAYS') then
    alter table public.solicitacoes drop column precisa_direcao;
  end if;
end $$;
alter table public.solicitacoes add column if not exists precisa_direcao boolean not null default false;

alter table public.solicitacoes
  add column if not exists grupo_solicitante    text,
  add column if not exists fluxo                text,
  add column if not exists pendentes            text[] not null default '{}',
  add column if not exists gozo_imediato        boolean not null default false,
  add column if not exists referencia_id        uuid references public.solicitacoes(id) on delete set null,
  add column if not exists referencia_protocolo text,
  add column if not exists unidade_destino_id   uuid references public.unidades(id),
  add column if not exists unidade_destino_nome text;

alter table public.solicitacoes add constraint solicitacoes_categoria_check check (categoria in
  ('ponto','folga','ferias','cancelamento','saida','estagio','transferencia'));
alter table public.solicitacoes add constraint solicitacoes_situacao_check check (situacao in
  ('Aguardando chefia','Aguardando coordenação','Aguardando direção','Aprovado','Negado','Cancelado'));
alter table public.solicitacoes add constraint tipo_por_categoria_ck check (
     (categoria = 'ponto' and tipo in ('Esquecimento','Atestado','Erro no relógio','Outros'))
  or (categoria = 'folga' and tipo in ('Banco de horas','Folga abonada (Art. 56, XII)','Serviço eleitoral (TRE)',
                                       'Campanha de vacinação','Abono natalício (Art. 56, X)','Outros'))
  or (categoria = 'ferias' and tipo = 'Férias')
  or (categoria = 'cancelamento' and tipo in ('Cancelamento de folga','Cancelamento de férias'))
  or (categoria = 'saida' and tipo = 'Saída antecipada')
  or (categoria = 'estagio' and tipo = 'Solicitação de estágio')
  or (categoria = 'transferencia' and tipo = 'Transferência de lotação'));
alter table public.solicitacoes add constraint arquivo_so_finalizado_ck
  check (not arquivado or situacao in ('Aprovado','Negado','Cancelado'));
alter table public.solicitacoes drop constraint if exists fluxo_ck;
alter table public.solicitacoes drop constraint if exists pendentes_ck;
alter table public.solicitacoes add constraint fluxo_ck
  check (fluxo is null or fluxo in ('ambos','um','saida_estagio','coordenacao','direcao'));
alter table public.solicitacoes add constraint pendentes_ck
  check (pendentes <@ array['enfermeiro','gerente']::text[]);

update public.solicitacoes set precisa_direcao = (categoria = 'folga') where fluxo is null;

-- Assinaturas (quem assinou cada etapa, no lugar de quem e por quê)
create table if not exists public.assinaturas (
  id              bigint generated always as identity primary key,
  solicitacao_id  uuid not null references public.solicitacoes(id) on delete cascade,
  etapa           text not null check (etapa in ('chefia','enfermeiro','gerente','coordenacao','direcao')),
  decisao         text not null check (decisao in ('Aprovado','Negado')),
  por             uuid references public.perfis(id) on delete set null,
  nome            text not null,
  papel           text not null,
  substituicao    text check (length(substituicao) <= 300),
  obs             text check (length(obs) <= 1000),
  criado_em       timestamptz not null default now()
);
create index if not exists assinaturas_solicitacao_idx on public.assinaturas (solicitacao_id, criado_em);
create index if not exists assinaturas_por_idx on public.assinaturas (por, criado_em desc);

-- Traz as decisões antigas para a tabela de assinaturas (uma vez só)
insert into public.assinaturas (solicitacao_id, etapa, decisao, por, nome, papel, obs, criado_em)
select id, 'chefia', chefia_decisao, chefia_por, coalesce(chefia_nome, 'Chefia'), 'chefia', chefia_obs, coalesce(chefia_em, atualizado_em)
  from public.solicitacoes s
 where chefia_decisao is not null
   and not exists (select 1 from public.assinaturas a where a.solicitacao_id = s.id and a.etapa = 'chefia');
insert into public.assinaturas (solicitacao_id, etapa, decisao, por, nome, papel, obs, criado_em)
select id, 'direcao', direcao_decisao, direcao_por, coalesce(direcao_nome, 'Direção'), 'direcao', direcao_obs, coalesce(direcao_em, atualizado_em)
  from public.solicitacoes s
 where direcao_decisao is not null
   and not exists (select 1 from public.assinaturas a where a.solicitacao_id = s.id and a.etapa = 'direcao');

-- Caminho de um pedido, conforme quem pede e o que pede
create or replace function public.rota_pedido(p_papel text, p_grupo text, p_categoria text,
  out fluxo text, out pendentes text[], out situacao text, out precisa_direcao boolean)
language plpgsql immutable as $$
begin
  precisa_direcao := p_categoria in ('folga','ferias','cancelamento');
  pendentes := '{}';
  if p_categoria = 'transferencia' then
    fluxo := 'coordenacao'; situacao := 'Aguardando coordenação'; precisa_direcao := false;
  elsif p_papel in ('supervisor','coordenacao','direcao') then
    fluxo := 'direcao'; situacao := 'Aguardando direção'; precisa_direcao := true;
  elsif p_papel = 'gerente' or p_grupo = 'gerente' then
    fluxo := 'coordenacao'; situacao := 'Aguardando coordenação';
  elsif p_papel = 'enfermeiro' or p_grupo = 'enfermeiro' then
    fluxo := 'ambos'; pendentes := array['gerente']; situacao := 'Aguardando chefia';
  elsif p_categoria in ('saida','estagio') then
    fluxo := 'saida_estagio'; pendentes := array['enfermeiro']; situacao := 'Aguardando chefia';
  elsif p_grupo = 'farmacia' then
    fluxo := 'um'; pendentes := array['enfermeiro','gerente']; situacao := 'Aguardando chefia';
  else
    fluxo := 'ambos'; pendentes := array['enfermeiro','gerente']; situacao := 'Aguardando chefia';
  end if;
end $$;

-- Pedidos que estavam em análise passam a seguir o fluxo novo
update public.solicitacoes s set
  (fluxo, pendentes, situacao, precisa_direcao) =
    (select r.fluxo, r.pendentes, r.situacao, r.precisa_direcao from public.rota_pedido(p.papel, p.grupo_cargo, s.categoria) r),
  grupo_solicitante = p.grupo_cargo
from public.perfis p
where p.id = s.solicitante_id and s.fluxo is null and s.situacao = 'Aguardando chefia';
update public.solicitacoes s set fluxo = 'direcao', grupo_solicitante = coalesce(s.grupo_solicitante, p.grupo_cargo)
  from public.perfis p
 where p.id = s.solicitante_id and s.fluxo is null;

-- Nova solicitação: quem pediu, caminho, protocolo e validações
create or replace function public.tg_solicitacao_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record; v_ano int := ano_atual(); v_hoje int; r record; ref solicitacoes;
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  select * into p from perfis where id = auth.uid();

  select count(*) into v_hoje from solicitacoes
   where solicitante_id = p.id and criado_em > now() - interval '24 hours';
  if v_hoje >= (select limite_pedidos_dia from seguranca_config) then
    raise exception 'Limite de solicitações em 24 horas atingido. Tente de novo amanhã ou procure a sua chefia';
  end if;

  new.solicitante_id        := p.id;
  new.solicitante_nome      := p.nome;
  new.solicitante_matricula := p.matricula;
  new.solicitante_cargo     := p.cargo;
  new.grupo_solicitante     := p.grupo_cargo;
  new.unidade_id            := p.unidade_id;
  new.unidade_nome          := (select nome from unidades where id = p.unidade_id);

  new.data_fim := coalesce(new.data_fim, new.data_inicio);
  new.justificativa := nullif(trim(new.justificativa), '');
  new.gozo_imediato := coalesce(new.gozo_imediato, false) and new.categoria = 'folga';

  -- Horários: ajuste de ponto (menos atestado) e saída antecipada
  if new.categoria = 'saida' then
    new.entrada := null; new.saida_almoco := null; new.retorno_almoco := null;
    new.data_fim := new.data_inicio;
    if new.saida is null then raise exception 'Informe o horário da saída antecipada'; end if;
    if new.justificativa is null then raise exception 'Explique o motivo da saída antecipada'; end if;
  elsif new.categoria <> 'ponto' or new.tipo = 'Atestado' then
    new.entrada := null; new.saida_almoco := null; new.retorno_almoco := null; new.saida := null;
  elsif coalesce(new.entrada, new.saida_almoco, new.retorno_almoco, new.saida) is null then
    raise exception 'Informe pelo menos um horário para o ajuste de ponto';
  end if;

  if new.categoria = 'estagio' and new.justificativa is null then
    raise exception 'Informe a instituição, o curso e os horários do estágio';
  end if;

  -- Transferência: unidade de destino
  if new.categoria = 'transferencia' then
    select id, nome into r from unidades where id = new.unidade_destino_id and ativa;
    if not found then raise exception 'Escolha a unidade de destino'; end if;
    if new.unidade_destino_id = p.unidade_id then raise exception 'A unidade de destino é a mesma da sua lotação'; end if;
    if new.justificativa is null then raise exception 'Explique o motivo da transferência'; end if;
    new.unidade_destino_nome := r.nome;
    new.data_fim := new.data_inicio;
  else
    new.unidade_destino_id := null; new.unidade_destino_nome := null;
  end if;

  -- Cancelamento: de uma folga ou férias sua já aprovada
  if new.categoria = 'cancelamento' then
    select * into ref from solicitacoes where id = new.referencia_id;
    if not found or ref.solicitante_id <> p.id then raise exception 'Escolha a folga ou as férias que deseja cancelar'; end if;
    if ref.situacao <> 'Aprovado' or ref.categoria not in ('folga','ferias') then
      raise exception 'Só dá para pedir o cancelamento de folga ou férias já aprovadas (pedidos em análise você mesmo cancela)';
    end if;
    if (ref.categoria = 'folga') <> (new.tipo = 'Cancelamento de folga') then
      raise exception 'O tipo do cancelamento não confere com o pedido escolhido';
    end if;
    if exists (select 1 from solicitacoes c where c.referencia_id = ref.id and c.categoria = 'cancelamento'
                and c.situacao like 'Aguardando%') then
      raise exception 'Já existe um pedido de cancelamento em análise para este protocolo';
    end if;
    new.referencia_protocolo := ref.protocolo;
    new.data_inicio := ref.data_inicio;
    new.data_fim := ref.data_fim;
  else
    new.referencia_id := null; new.referencia_protocolo := null;
  end if;

  if (new.tipo = 'Atestado' or new.tipo = 'Serviço eleitoral (TRE)') and new.anexo_path is null then
    raise exception 'Este tipo de solicitação precisa do comprovante anexado';
  end if;
  new.anexo_bucket := 'comprovantes';
  if new.anexo_path is not null then
    if split_part(new.anexo_path, '/', 1) <> auth.uid()::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'comprovantes' and o.name = new.anexo_path)
       or exists (select 1 from solicitacoes s where s.anexo_bucket = 'comprovantes' and s.anexo_path = new.anexo_path) then
      raise exception 'Anexo inválido';
    end if;
  end if;
  if new.tipo = 'Outros' and new.justificativa is null then
    raise exception 'Explique o motivo na justificativa';
  end if;

  -- Caminho das assinaturas (Circular 254/2026)
  select * into r from rota_pedido(p.papel, p.grupo_cargo, new.categoria);
  new.fluxo := r.fluxo; new.pendentes := r.pendentes; new.situacao := r.situacao; new.precisa_direcao := r.precisa_direcao;

  new.chefia_decisao := null; new.chefia_por := null; new.chefia_nome := null; new.chefia_em := null; new.chefia_obs := null;
  new.direcao_decisao := null; new.direcao_por := null; new.direcao_nome := null; new.direcao_em := null; new.direcao_obs := null;
  new.cancelado_em := null; new.arquivado := false; new.arquivado_em := null; new.id_antigo := null;
  new.protocolo := v_ano || '-' || lpad(proximo_numero('protocolo', v_ano)::text, 4, '0');
  new.criado_em := now();
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public.tg_solicitacao_criada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform registrar_historico(new.id,
    case new.situacao
      when 'Aguardando coordenação' then 'Solicitação enviada à Coordenação de Enfermagem'
      when 'Aguardando direção' then 'Solicitação enviada direto à Direção'
      else 'Solicitação enviada para assinatura de ' || case
             when new.fluxo = 'um' then 'uma chefia da unidade (Enfermeiro ou Gerente)'
             when new.pendentes = array['gerente'] then 'Gerente da unidade'
             when new.pendentes = array['enfermeiro'] then 'Enfermeiro responsável'
             else 'Enfermeiro responsável e Gerente da unidade' end
    end,
    case when new.referencia_protocolo is not null then 'Cancelamento do protocolo ' || new.referencia_protocolo end);
  return null;
end $$;

-- =========================== ASSINATURA ==============================
create or replace function public.rotulo_vaga(p text) returns text
language sql immutable as $$
  select case p when 'enfermeiro' then 'Enfermeiro responsável' when 'gerente' then 'Gerente'
                when 'coordenacao' then 'Coordenação de Enfermagem' when 'direcao' then 'Direção'
                when 'supervisor' then 'Supervisor' else 'Chefia' end;
$$;

-- Ao aprovar de vez: cancela o pedido de origem (cancelamento) e registra férias de chefia como ausência
create or replace function public.aplicar_aprovacao(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s solicitacoes; t perfis;
begin
  select * into s from solicitacoes where id = p_id;
  if s.categoria = 'cancelamento' and s.referencia_id is not null then
    update solicitacoes set situacao = 'Cancelado', cancelado_em = now()
     where id = s.referencia_id and situacao = 'Aprovado';
    insert into historico (solicitacao_id, acao, detalhe, usuario_id, usuario_nome)
    values (s.referencia_id, 'Cancelada pelo pedido de cancelamento aprovado', s.protocolo, auth.uid(),
            (select nome from perfis where id = auth.uid()));
    delete from ausencias where solicitacao_id = s.referencia_id;
  end if;
  if s.categoria = 'ferias' then
    select * into t from perfis where id = s.solicitante_id;
    if t.papel in ('enfermeiro','gerente') then
      insert into ausencias (perfil_id, perfil_nome, papel, unidade_id, inicio, fim, motivo, observacao, solicitacao_id, registrado_por, registrado_nome)
      values (t.id, t.nome, t.papel, t.unidade_id, s.data_inicio, s.data_fim, 'Férias', 'Férias aprovadas ' || s.protocolo, s.id,
              auth.uid(), (select nome from perfis where id = auth.uid()));
    end if;
  end if;
end $$;

/*
  assinar: única porta para aprovar ou negar.
  p_no_lugar_de      : 'enfermeiro' ou 'gerente' (Supervisor, ou Gerente em saída/estágio)
  p_motivo_ausencia  : 'Férias' ou 'Afastamento médico' quando a ausência não está registrada
  p_outra_ciente     : folga para gozo imediato, uma chefia assina sozinha com a outra ciente
*/
create or replace function public.assinar(p_id uuid, p_aprovar boolean, p_obs text default null,
  p_no_lugar_de text default null, p_motivo_ausencia text default null, p_outra_ciente boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare
  s solicitacoes; eu perfis;
  v_obs text := left(nullif(trim(p_obs), ''), 1000);
  v_motivo text := nullif(trim(p_motivo_ausencia), '');
  v_vaga text; v_sub text; v_etapa text; v_nova text; v_pend text[]; v_outra text; v_acao text;
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  select * into eu from perfis where id = auth.uid();
  select * into s from solicitacoes where id = p_id for update;
  if not found or not pode_ver_solicitacao(s.solicitante_id, s.unidade_id) then raise exception 'Solicitação não encontrada'; end if;
  if s.solicitante_id = eu.id then raise exception 'Você não pode assinar a sua própria solicitação'; end if;
  if not p_aprovar and v_obs is null then raise exception 'Informe o motivo da negativa'; end if;
  if v_motivo is not null and v_motivo not in ('Férias','Afastamento médico') then
    raise exception 'O motivo da ausência precisa ser Férias ou Afastamento médico';
  end if;
  v_pend := s.pendentes;

  if s.situacao = 'Aguardando chefia' then
    v_etapa := null;
    -- Titular da vaga (Enfermeiro responsável ou Gerente da própria unidade)
    if eu.papel in ('enfermeiro','gerente') and eu.unidade_id = s.unidade_id and eu.papel = any(v_pend) then
      v_vaga := eu.papel;
    -- Gerente no lugar do Enfermeiro: só saída antecipada e estágio
    elsif eu.papel = 'gerente' and eu.unidade_id = s.unidade_id and s.fluxo = 'saida_estagio' and 'enfermeiro' = any(v_pend) then
      if not vaga_ausente(s.unidade_id, 'enfermeiro') and v_motivo is null then
        raise exception 'Em saída antecipada e estágio, o Gerente só assina na ausência do Enfermeiro. Informe o motivo da ausência (férias ou afastamento médico).';
      end if;
      v_vaga := 'enfermeiro';
      v_sub := 'Gerente no lugar do Enfermeiro responsável (' || coalesce(v_motivo, motivo_ausencia(s.unidade_id, 'enfermeiro')) || ')';
    -- Supervisor no lugar de uma chefia ausente
    elsif eu.papel = 'supervisor' and supervisiona(s.unidade_id) then
      if s.fluxo = 'saida_estagio' then
        raise exception 'Saída antecipada e estágio não são assinados pelo Supervisor: com Enfermeiro e Gerente ausentes, o pedido aguarda o retorno das chefias.';
      end if;
      v_vaga := coalesce(nullif(p_no_lugar_de, ''), case when cardinality(v_pend) = 1 then v_pend[1] end);
      if v_vaga is null or not v_vaga = any(v_pend) then
        raise exception 'Indique no lugar de quem você assina (Enfermeiro responsável ou Gerente)';
      end if;
      if s.fluxo = 'um' then
        if v_motivo is null and not (vaga_ausente(s.unidade_id, 'enfermeiro') and vaga_ausente(s.unidade_id, 'gerente')) then
          raise exception 'Para Farmácia, o Supervisor só assina com Enfermeiro e Gerente ausentes. Informe o motivo da ausência.';
        end if;
        v_sub := 'Supervisor no lugar da chefia da unidade (' || coalesce(v_motivo, 'Enfermeiro e Gerente ausentes') || ')';
      else
        if v_motivo is null and not vaga_ausente(s.unidade_id, v_vaga) then
          raise exception 'O Supervisor só assina na ausência do % (férias ou afastamento médico). Informe o motivo da ausência.', rotulo_vaga(v_vaga);
        end if;
        v_sub := 'Supervisor no lugar do ' || rotulo_vaga(v_vaga) || ' (' || coalesce(v_motivo, motivo_ausencia(s.unidade_id, v_vaga)) || ')';
      end if;
    else
      raise exception 'Esta solicitação não está aguardando a sua assinatura';
    end if;

    v_etapa := v_vaga;
    if not p_aprovar then
      v_nova := 'Negado'; v_pend := '{}';
    else
      v_pend := array_remove(v_pend, v_vaga);
      if s.fluxo = 'um' then v_pend := '{}'; end if;
      -- Folga para gozo imediato: uma chefia assina pelas duas, com a outra ausente e ciente
      if p_outra_ciente then
        v_outra := v_pend[1];
        if not (s.categoria = 'folga' and s.gozo_imediato and s.fluxo = 'ambos' and v_sub is null and cardinality(v_pend) = 1) then
          raise exception 'A assinatura única vale só para folga de gozo imediato, assinada pelo Enfermeiro ou pelo Gerente da unidade';
        end if;
        if not vaga_ausente(s.unidade_id, v_outra) and v_motivo is null then
          raise exception 'A assinatura única é para quando a outra chefia está ausente. Informe o motivo da ausência.';
        end if;
        v_sub := 'Assinou também pelo ' || rotulo_vaga(v_outra) || ' (folga para gozo imediato; ' || rotulo_vaga(v_outra)
                 || ' ausente por ' || coalesce(v_motivo, motivo_ausencia(s.unidade_id, v_outra)) || ' e ciente, com consenso prévio)';
        v_pend := '{}';
      end if;
      v_nova := case when cardinality(v_pend) > 0 then 'Aguardando chefia'
                     when s.precisa_direcao then 'Aguardando direção' else 'Aprovado' end;
    end if;

  elsif s.situacao = 'Aguardando coordenação' then
    if not (eu.papel = 'coordenacao' or (eu.papel = 'direcao' and s.categoria = 'transferencia')) then
      raise exception 'Esta solicitação aguarda a Coordenação de Enfermagem';
    end if;
    v_etapa := 'coordenacao';
    v_nova := case when not p_aprovar then 'Negado' when s.precisa_direcao then 'Aguardando direção' else 'Aprovado' end;

  elsif s.situacao = 'Aguardando direção' then
    if eu.papel <> 'direcao' then raise exception 'Esta solicitação aguarda a decisão da Direção'; end if;
    v_etapa := 'direcao';
    v_nova := case when p_aprovar then 'Aprovado' else 'Negado' end;

  else
    raise exception 'Esta solicitação já foi finalizada';
  end if;

  insert into assinaturas (solicitacao_id, etapa, decisao, por, nome, papel, substituicao, obs)
  values (p_id, v_etapa, case when p_aprovar then 'Aprovado' else 'Negado' end, eu.id, eu.nome, eu.papel, v_sub, v_obs);

  update solicitacoes set situacao = v_nova, pendentes = v_pend,
    direcao_decisao = case when v_etapa = 'direcao' then v_nova else direcao_decisao end,
    direcao_por = case when v_etapa = 'direcao' then eu.id else direcao_por end,
    direcao_nome = case when v_etapa = 'direcao' then eu.nome else direcao_nome end,
    direcao_em = case when v_etapa = 'direcao' then now() else direcao_em end,
    direcao_obs = case when v_etapa = 'direcao' then v_obs else direcao_obs end
  where id = p_id;

  v_acao := (case when p_aprovar then 'Assinada' else 'Negada' end) || ' por ' || rotulo_vaga(eu.papel)
            || case when v_sub is not null then ' | ' || v_sub else '' end
            || case v_nova when 'Aguardando chefia' then '. Aguarda a outra assinatura da unidade'
                           when 'Aguardando direção' then '. Enviada à Direção'
                           when 'Aprovado' then '. Aprovada'
                           else '' end;
  perform registrar_historico(p_id, v_acao, v_obs);

  if v_nova = 'Aprovado' then perform aplicar_aprovacao(p_id); end if;
  return v_nova;
end $$;

-- As funções antigas continuam respondendo (site em cache), agora pelo fluxo novo
create or replace function public.decidir_chefia(p_id uuid, p_aprovar boolean, p_obs text default null)
returns text language sql security definer set search_path = public as $$ select assinar(p_id, p_aprovar, p_obs) $$;
create or replace function public.decidir_direcao(p_id uuid, p_aprovar boolean, p_obs text default null)
returns text language sql security definer set search_path = public as $$ select assinar(p_id, p_aprovar, p_obs) $$;

-- O que está esperando a minha assinatura (e como posso assinar)
create or replace function public.fila_assinaturas()
returns table (id uuid, como text, vagas text[], ausentes text[], precisa_motivo boolean)
language sql stable security definer set search_path = public as $$
  with eu as (select p.* from perfis p where p.id = auth.uid() and usuario_ativo())
  select s.id,
         x.como, x.vagas,
         array(select v from unnest(s.pendentes) v where vaga_ausente(s.unidade_id, v)) as ausentes,
         x.precisa_motivo
    from solicitacoes s
    cross join eu
    cross join lateral (
      select case
        when s.situacao = 'Aguardando chefia' and eu.papel in ('enfermeiro','gerente')
             and eu.unidade_id = s.unidade_id and eu.papel = any(s.pendentes)
          then 'titular'
        when s.situacao = 'Aguardando chefia' and eu.papel = 'gerente' and eu.unidade_id = s.unidade_id
             and s.fluxo = 'saida_estagio' and 'enfermeiro' = any(s.pendentes)
          then 'gerente_substituto'
        when s.situacao = 'Aguardando chefia' and eu.papel = 'supervisor' and s.fluxo <> 'saida_estagio'
             and exists (select 1 from supervisao sv where sv.supervisor_id = eu.id and sv.unidade_id = s.unidade_id)
          then 'supervisor'
        when s.situacao = 'Aguardando coordenação' and (eu.papel = 'coordenacao' or (eu.papel = 'direcao' and s.categoria = 'transferencia'))
          then 'coordenacao'
        when s.situacao = 'Aguardando direção' and eu.papel = 'direcao'
          then 'direcao'
      end as como,
      case
        when eu.papel in ('enfermeiro','gerente') and eu.papel = any(s.pendentes) then array[eu.papel]
        when eu.papel = 'gerente' then array['enfermeiro']
        when eu.papel = 'supervisor' then s.pendentes
        else '{}'::text[]
      end as vagas,
      case
        when eu.papel = 'gerente' and not (eu.papel = any(s.pendentes)) then not vaga_ausente(s.unidade_id, 'enfermeiro')
        when eu.papel = 'supervisor' and s.fluxo = 'um'
          then not (vaga_ausente(s.unidade_id, 'enfermeiro') and vaga_ausente(s.unidade_id, 'gerente'))
        when eu.papel = 'supervisor'
          then not exists (select 1 from unnest(s.pendentes) v where vaga_ausente(s.unidade_id, v))
        else false
      end as precisa_motivo
    ) x
   where x.como is not null and s.solicitante_id <> eu.id
   order by s.criado_em;
$$;

-- Cancelar enquanto estiver em análise (qualquer etapa)
create or replace function public.cancelar_solicitacao(p_id uuid, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s solicitacoes;
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  select * into s from solicitacoes where id = p_id for update;
  if not found or s.solicitante_id <> auth.uid() then raise exception 'Solicitação não encontrada'; end if;
  if s.situacao not like 'Aguardando%' then
    raise exception 'Só dá para cancelar enquanto a solicitação está em análise. Se já foi aprovada, faça um pedido de cancelamento.';
  end if;
  update solicitacoes set situacao = 'Cancelado', cancelado_em = now(), pendentes = '{}' where id = p_id;
  perform registrar_historico(p_id, 'Cancelada por quem pediu', left(p_motivo, 500));
end $$;

create or replace function public.pode_ver_solicitacao(p_solicitante uuid, p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select usuario_ativo() and (p_solicitante = auth.uid() or ve_unidade(p_unidade)
                              or ((is_direcao() or is_coordenacao()) and p_unidade is null));
$$;

-- ======================== REGRAS DE ACESSO ===========================
alter table public.supervisao  enable row level security;
alter table public.ausencias   enable row level security;
alter table public.assinaturas enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or ve_unidade(unidade_id) or is_direcao() or is_coordenacao());

drop policy if exists supervisao_ler on public.supervisao;
drop policy if exists supervisao_direcao on public.supervisao;
create policy supervisao_ler on public.supervisao for select to authenticated using (usuario_ativo());
create policy supervisao_direcao on public.supervisao for all to authenticated using (is_direcao()) with check (is_direcao());

drop policy if exists ausencias_ler on public.ausencias;
create policy ausencias_ler on public.ausencias for select to authenticated
  using (usuario_ativo() and (perfil_id = auth.uid() or ve_unidade(unidade_id)));

drop policy if exists assinaturas_ler on public.assinaturas;
create policy assinaturas_ler on public.assinaturas for select to authenticated
  using (exists (select 1 from solicitacoes s where s.id = solicitacao_id));

-- ========================== PRIVILÉGIOS ==============================
revoke all on public.supervisao, public.ausencias, public.assinaturas from anon, authenticated;
grant select on public.supervisao, public.ausencias, public.assinaturas to authenticated;
grant insert, delete on public.supervisao to authenticated;
grant update (nome, cargo, papel, grupo_cargo, unidade_id, ativo, deve_trocar_senha) on public.perfis to authenticated;
grant insert (categoria, tipo, subtipo, data_inicio, data_fim, entrada, saida_almoco, retorno_almoco, saida,
              justificativa, anexo_path, anexo_nome, gozo_imediato, referencia_id, unidade_destino_id)
  on public.solicitacoes to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.assinar(uuid, boolean, text, text, text, boolean) to authenticated;
grant execute on function public.fila_assinaturas()                                 to authenticated;
grant execute on function public.registrar_ausencia(uuid, date, date, text, text)   to authenticated;
grant execute on function public.remover_ausencia(uuid)                             to authenticated;
grant execute on function public.decidir_chefia(uuid, boolean, text)                to authenticated;
grant execute on function public.decidir_direcao(uuid, boolean, text)               to authenticated;
grant execute on function public.cancelar_solicitacao(uuid, text)                   to authenticated;
grant execute on function public.minha_seguranca()                                  to authenticated;
grant execute on function public.usuario_ativo()                                    to authenticated;
grant execute on function public.is_direcao()                                       to authenticated;
grant execute on function public.is_chefia()                                        to authenticated;
grant execute on function public.is_coordenacao()                                   to authenticated;
grant execute on function public.meu_papel()                                        to authenticated;
grant execute on function public.supervisiona(uuid)                                 to authenticated;
grant execute on function public.ve_unidade(uuid)                                   to authenticated;
grant execute on function public.minha_unidade()                                    to authenticated;
grant execute on function public.mfa_ok(text)                                       to authenticated;
grant execute on function public.pode_ver_solicitacao(uuid, uuid)                   to authenticated;
grant execute on function public.hoje()                                             to authenticated;
grant all on public.supervisao, public.ausencias, public.assinaturas to service_role;
grant execute on all functions in schema public to service_role;

-- Comprovantes: quem vê a unidade também abre (pela Edge Function rh-comprovante, que usa pode_ver_solicitacao)

-- Conferência rápida (aparece no resultado do SQL Editor)
select papel, grupo_cargo, count(*) as pessoas from public.perfis group by 1, 2 order by 1, 2;

commit;
