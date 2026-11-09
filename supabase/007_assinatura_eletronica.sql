-- =====================================================================
-- SIGER RH | FSPSS
-- 007_assinatura_eletronica.sql: assinatura eletrônica com confirmação de senha (Lei 14.063/2020)
-- Rodar inteiro no SQL Editor, depois do 006. Pode rodar de novo sem problema.
--
-- Para assinar (ao enviar, aprovar ou negar), a pessoa confirma a senha de acesso.
-- A senha nunca é gravada: ela gera uma autorização de uso único (2 minutos).
-- Cada assinatura (de quem pede e de cada chefia) guarda:
--   data e hora do servidor,
--   aparelho e endereço de rede, e o "código do documento" (hash SHA-256 do
--   conteúdo assinado). Se o conteúdo mudar, o código deixa de bater.
-- Quem assina já está identificado pelo login (e pela verificação em duas
-- etapas, nas chefias). O comprovante tem um QR code que abre a página pública
-- de verificação, que mostra só o essencial (sem justificativa nem anexo).
-- =====================================================================

begin;

-- ============================ COLUNAS ================================
alter table public.solicitacoes
  add column if not exists hash_documento      text,
  add column if not exists codigo_verificacao  text,
  add column if not exists assinado_ip         text,
  add column if not exists assinado_aparelho   text,
  add column if not exists metodo_assinatura   text,
  add column if not exists token_assinatura    text;  -- sempre vazio: só leva a autorização até o gatilho
create unique index if not exists solicitacoes_codigo_idx on public.solicitacoes (codigo_verificacao);

alter table public.assinaturas
  add column if not exists hash_documento  text,
  add column if not exists hash_assinatura text,
  add column if not exists ip              text,
  add column if not exists aparelho        text,
  add column if not exists metodo          text;


-- Autorizações de uso único geradas pela confirmação de senha (guardadas só como hash)
create table if not exists public.autorizacoes_assinatura (
  token_hash text primary key,
  perfil_id  uuid not null references public.perfis(id) on delete cascade,
  expira_em  timestamptz not null,
  usada_em   timestamptz
);
-- Tentativas erradas de senha (freio contra adivinhação)
create table if not exists public.tentativas_senha (
  id        bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  em        timestamptz not null default now()
);
create index if not exists tentativas_senha_idx on public.tentativas_senha (perfil_id, em desc);

-- ============================ APOIO ==================================
create or replace function public.sha256_hex(p text) returns text
language sql immutable as $$ select encode(sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex') $$;

create or replace function public.instante(t timestamptz) returns text
language sql immutable as $$ select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

-- Endereço de rede e aparelho de quem chamou (cabeçalhos repassados pelo Supabase)
create or replace function public.ip_cliente() returns text
language sql stable as $$
  select left(coalesce(
    nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip',
    nullif(current_setting('request.headers', true), '')::json->>'x-real-ip',
    trim(split_part(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ',', 1)),
    'não informado'), 60);
$$;
create or replace function public.aparelho_cliente() returns text
language sql stable as $$
  select left(coalesce(nullif(current_setting('request.headers', true), '')::json->>'user-agent', 'não informado'), 300);
$$;

-- Confere a senha de quem está usando e devolve uma autorização de uso único (vazio = senha errada)
create or replace function public.confirmar_senha(p_senha text) returns text
language plpgsql volatile security definer set search_path = public, extensions, auth as $$
declare v_ok boolean; v_token text;
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  if (select count(*) from public.tentativas_senha where perfil_id = auth.uid() and em > now() - interval '15 minutes') >= 5 then
    raise exception 'Muitas tentativas com a senha errada. Espere 15 minutos e tente de novo';
  end if;
  select u.encrypted_password is not null and u.encrypted_password = crypt(coalesce(p_senha, ''), u.encrypted_password)
    into v_ok from auth.users u where u.id = auth.uid();
  if not coalesce(v_ok, false) then
    -- devolve vazio em vez de erro, para a tentativa errada ficar registrada
    insert into public.tentativas_senha (perfil_id) values (auth.uid());
    return null;
  end if;
  delete from public.tentativas_senha where perfil_id = auth.uid();
  delete from public.autorizacoes_assinatura where expira_em < now() - interval '1 day';
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.autorizacoes_assinatura (token_hash, perfil_id, expira_em)
  values (sha256_hex(v_token), auth.uid(), now() + interval '2 minutes');
  return v_token;
end $$;

-- Usa (e invalida) a autorização; devolve true se era válida
create or replace function public.usar_autorizacao(p_token text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) <> 64 then return false; end if;
  update autorizacoes_assinatura set usada_em = now()
   where token_hash = sha256_hex(p_token) and perfil_id = auth.uid() and usada_em is null and expira_em > now();
  return found;
end $$;

-- Texto exato que é assinado (o hash é calculado sobre ele)
create or replace function public.documento_texto(s public.solicitacoes) returns text
language sql stable as $$
  select concat_ws(E'\n',
    'SIGER RH | FSPSS',
    'Protocolo: ' || s.protocolo,
    'Solicitante: ' || s.solicitante_nome || ' | Matrícula ' || coalesce(s.solicitante_matricula, ''),
    'Cargo: ' || coalesce(s.solicitante_cargo, ''),
    'Unidade: ' || coalesce(s.unidade_nome, ''),
    'Categoria: ' || s.categoria,
    'Tipo: ' || s.tipo || coalesce(' (' || s.subtipo || ')', ''),
    'Período: ' || s.data_inicio || ' a ' || s.data_fim,
    'Horários: ' || concat_ws(' / ', s.entrada, s.saida_almoco, s.retorno_almoco, s.saida),
    'Justificativa: ' || coalesce(s.justificativa, ''),
    'Anexo: ' || coalesce(s.anexo_path, ''),
    'Destino: ' || coalesce(s.unidade_destino_nome, ''),
    'Cancela: ' || coalesce(s.referencia_protocolo, ''),
    'Gozo imediato: ' || case when s.gozo_imediato then 'sim' else 'não' end,
    'Enviado em: ' || instante(s.criado_em),
    'Assinatura do solicitante: ' || coalesce(s.metodo_assinatura, 'sem assinatura'));
$$;

create or replace function public.hash_documento(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select sha256_hex(documento_texto(s)) from solicitacoes s where s.id = p_id;
$$;

create or replace function public.hash_da_assinatura(a public.assinaturas) returns text
language sql stable as $$
  select sha256_hex(concat_ws('|', a.hash_documento, a.etapa, a.decisao, a.por, a.nome, a.papel,
                              coalesce(a.substituicao, ''), coalesce(a.obs, ''), instante(a.criado_em),
                              coalesce(a.metodo, '')));
$$;

-- ==================== ASSINATURA DE QUEM PEDE ========================
-- Roda depois da validação do pedido (os gatilhos "before" rodam em ordem alfabética)
create or replace function public.tg_solicitacao_assinatura() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not usar_autorizacao(new.token_assinatura) then
    raise exception 'Confirme com a sua senha para assinar e enviar';
  end if;
  new.metodo_assinatura := 'senha';
  new.token_assinatura := null;  -- a autorização nunca fica gravada
  new.assinado_ip := ip_cliente();
  new.assinado_aparelho := aparelho_cliente();
  new.codigo_verificacao := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' ||
                                  substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' ||
                                  substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  new.hash_documento := sha256_hex(documento_texto(new));
  return new;
end $$;
drop trigger if exists solicitacoes_zz_assinatura on public.solicitacoes;
create trigger solicitacoes_zz_assinatura before insert on public.solicitacoes
  for each row execute function public.tg_solicitacao_assinatura();

-- Pedidos antigos ganham código de verificação e hash
update public.solicitacoes
   set codigo_verificacao = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' ||
                                  substr(replace(gen_random_uuid()::text, '-', ''), 1, 4) || '-' ||
                                  substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
 where codigo_verificacao is null;
update public.solicitacoes s set hash_documento = sha256_hex(documento_texto(s)) where hash_documento is null;

-- Conteúdo assinado não muda depois (nem pela Direção): só situação, pendências e arquivo
create or replace function public.tg_conteudo_assinado() returns trigger
language plpgsql as $$
begin
  if new.hash_documento is distinct from old.hash_documento
     or new.metodo_assinatura is distinct from old.metodo_assinatura
     or new.codigo_verificacao is distinct from old.codigo_verificacao
     or sha256_hex(documento_texto(new)) is distinct from sha256_hex(documento_texto(old)) then
    raise exception 'O conteúdo de uma solicitação assinada não pode ser alterado';
  end if;
  return new;
end $$;
drop trigger if exists solicitacoes_conteudo_assinado on public.solicitacoes;
create trigger solicitacoes_conteudo_assinado before update on public.solicitacoes
  for each row execute function public.tg_conteudo_assinado();

-- Assinaturas são definitivas
create or replace function public.tg_assinatura_imutavel() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from solicitacoes where id = old.solicitacao_id) then
      raise exception 'Assinaturas não podem ser apagadas';
    end if;
    return old;  -- a solicitação inteira está sendo excluída
  end if;
  if old.hash_assinatura is not null or new.hash_documento is distinct from old.hash_documento
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Assinaturas não podem ser alteradas';
  end if;
  return new;
end $$;
drop trigger if exists assinaturas_imutaveis on public.assinaturas;
create trigger assinaturas_imutaveis before update or delete on public.assinaturas
  for each row execute function public.tg_assinatura_imutavel();

-- ====================== ASSINATURA DAS CHEFIAS =======================
drop function if exists public.assinar(uuid, boolean, text, text, text, boolean);
drop function if exists public.assinar(uuid, boolean, text, text, text, boolean, text);
drop function if exists public.assinar(uuid, boolean, text, text, text, boolean, text, text);
create or replace function public.assinar(p_id uuid, p_aprovar boolean, p_obs text default null,
  p_no_lugar_de text default null, p_motivo_ausencia text default null, p_outra_ciente boolean default false,
  p_token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  s solicitacoes; eu perfis;
  v_obs text := left(nullif(trim(p_obs), ''), 1000);
  v_motivo text := nullif(trim(p_motivo_ausencia), '');
  v_vaga text; v_sub text; v_etapa text; v_nova text; v_pend text[]; v_outra text; v_acao text; v_ass bigint; v_metodo text;
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  select * into eu from perfis where id = auth.uid();
  select * into s from solicitacoes where id = p_id for update;
  if not found or not pode_ver_solicitacao(s.solicitante_id, s.unidade_id) then raise exception 'Solicitação não encontrada'; end if;
  if s.solicitante_id = eu.id then raise exception 'Você não pode assinar a sua própria solicitação'; end if;
  if not p_aprovar and v_obs is null then raise exception 'Informe o motivo da negativa'; end if;
  if not usar_autorizacao(p_token) then raise exception 'Confirme com a sua senha para assinar'; end if;
  v_metodo := 'senha';
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

  insert into assinaturas (solicitacao_id, etapa, decisao, por, nome, papel, substituicao, obs,
                           metodo, hash_documento, ip, aparelho, criado_em)
  values (p_id, v_etapa, case when p_aprovar then 'Aprovado' else 'Negado' end, eu.id, eu.nome, eu.papel, v_sub, v_obs,
          v_metodo, hash_documento(p_id), ip_cliente(), aparelho_cliente(), now())
  returning id into v_ass;
  update assinaturas set hash_assinatura = hash_da_assinatura(a) from assinaturas a where a.id = v_ass and assinaturas.id = v_ass;

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


create or replace function public.decidir_chefia(p_id uuid, p_aprovar boolean, p_obs text default null)
returns text language sql security definer set search_path = public as $$ select assinar(p_id, p_aprovar, p_obs) $$;
create or replace function public.decidir_direcao(p_id uuid, p_aprovar boolean, p_obs text default null)
returns text language sql security definer set search_path = public as $$ select assinar(p_id, p_aprovar, p_obs) $$;

-- ================== VERIFICAÇÃO PÚBLICA (QR CODE) ====================
-- Qualquer pessoa com o código confere se o documento é autêntico e íntegro.
-- Mostra só o essencial: sem justificativa, anexo, horários ou matrícula completa.
create or replace function public.verificar_documento(p_codigo text) returns json
language plpgsql stable security definer set search_path = public as $$
declare s solicitacoes; v_nome text[];
begin
  select * into s from solicitacoes
   where codigo_verificacao = (select string_agg(substr(c, i, 4), '-' order by i)
                                 from (select upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g')) as c) x,
                                      generate_series(1, 9, 4) i);
  if not found then return json_build_object('encontrado', false); end if;
  v_nome := regexp_split_to_array(trim(s.solicitante_nome), '\s+');
  return json_build_object(
    'encontrado', true,
    'protocolo', s.protocolo,
    'categoria', s.categoria, 'tipo', s.tipo, 'subtipo', s.subtipo,
    'data_inicio', s.data_inicio, 'data_fim', s.data_fim,
    'unidade', s.unidade_nome,
    -- nome reduzido: "João P. da S."
    'solicitante', v_nome[1] || coalesce(' ' || (select string_agg(case when length(p) <= 3 then lower(p) else left(p, 1) || '.' end, ' ')
                                                   from unnest(v_nome[2:]) p), ''),
    'matricula', case when length(coalesce(s.solicitante_matricula, '')) > 2 then repeat('*', length(s.solicitante_matricula) - 2) || right(s.solicitante_matricula, 2) else '**' end,
    'situacao', s.situacao,
    'enviado_em', s.criado_em,
    'metodo', s.metodo_assinatura,
    'hash_registrado', s.hash_documento,
    'hash_atual', sha256_hex(documento_texto(s)),
    'integro', s.hash_documento = sha256_hex(documento_texto(s)),
    'assinaturas', coalesce((
      select json_agg(json_build_object(
        'etapa', a.etapa, 'decisao', a.decisao, 'nome', a.nome, 'papel', a.papel, 'substituicao', a.substituicao,
        'em', a.criado_em, 'metodo', a.metodo,
        'integra', a.hash_assinatura is null or a.hash_assinatura = hash_da_assinatura(a))
        order by a.criado_em)
      from assinaturas a where a.solicitacao_id = s.id), '[]'::json));
end $$;

-- ======================== REGRAS DE ACESSO ===========================
alter table public.autorizacoes_assinatura enable row level security;  -- sem políticas: só as funções mexem
alter table public.tentativas_senha enable row level security;
revoke all on public.autorizacoes_assinatura, public.tentativas_senha from anon, authenticated;

grant insert (token_assinatura) on public.solicitacoes to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.assinar(uuid, boolean, text, text, text, boolean, text) to authenticated;
grant execute on function public.confirmar_senha(text)                to authenticated;
grant execute on function public.decidir_chefia(uuid, boolean, text)  to authenticated;
grant execute on function public.decidir_direcao(uuid, boolean, text) to authenticated;
grant execute on function public.verificar_documento(text)            to anon, authenticated;
-- as que o 001/005/006 já liberavam continuam liberadas
grant execute on function public.fila_assinaturas(), public.registrar_ausencia(uuid, date, date, text, text),
  public.remover_ausencia(uuid), public.cancelar_solicitacao(uuid, text), public.minha_seguranca(), public.usuario_ativo(),
  public.is_direcao(), public.is_chefia(), public.is_coordenacao(), public.meu_papel(), public.supervisiona(uuid),
  public.ve_unidade(uuid), public.minha_unidade(), public.mfa_ok(text), public.pode_ver_solicitacao(uuid, uuid), public.hoje()
  to authenticated;
grant execute on all functions in schema public to service_role;

commit;
