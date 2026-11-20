-- =====================================================================
-- SIGER RH | FSPSS
-- 009_fluxos_configuraveis.sql: fluxos de assinatura montados pela Direção + baixa do RH
-- Rodar inteiro no SQL Editor, depois do 008. Pode rodar de novo sem problema.
--
-- MODELOS DE FLUXO (tabela "fluxos"): cada modelo tem um caminho padrão e, se
-- quiser, caminhos diferentes por tipo de pedido (folga, férias, ponto...).
-- Um caminho é uma lista de ETAPAS. Cada etapa tem:
--   vagas:      quem assina. Tipos:
--                 unidade  -> cargo na unidade do funcionário (enfermeiro, gerente, supervisor)
--                 papel    -> qualquer pessoa com um papel do sistema (direcao, coordenacao, diretor...)
--                 cargo    -> qualquer pessoa com o cargo escrito (ex.: "Diretor Administrativo")
--                 pessoa   -> uma pessoa específica
--   regra:      "todos" (cada vaga assina) ou "um" (basta uma)
--   substituto: quem assina no lugar de uma vaga ausente (férias ou afastamento médico)
--   gozo_imediato: na folga de gozo imediato, uma chefia pode assinar pelas duas
-- Cada funcionário aponta para um modelo (perfis.fluxo_id). O caminho é COPIADO
-- para o pedido no envio: mudar o modelo depois não muda pedidos já enviados.
-- A Circular 254/2026 vira um conjunto de modelos prontos (Atenção Básica).
--
-- RH: novo papel "rh" vê os pedidos e dá BAIXA (em lote) nos aprovados.
-- Novo papel "diretor": assina os pedidos dos fluxos em que aparece, sem administrar.
-- =====================================================================

begin;

-- ============================ PAPÉIS =================================
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('funcionario','enfermeiro','gerente','supervisor','coordenacao','diretor','rh','direcao'));
alter table public.perfis drop constraint if exists perfil_unidade_ck;
alter table public.perfis add constraint perfil_unidade_ck
  check (papel in ('direcao','coordenacao','supervisor','diretor','rh') or unidade_id is not null);

create or replace function public.is_rh() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'rh', false);
$$;

create or replace function public.mfa_ok(p_papel text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
      or not coalesce((select case when p_papel = 'direcao' then exigir_mfa_direcao
                                   when p_papel in ('enfermeiro','gerente','supervisor','coordenacao','diretor','rh','chefia') then exigir_mfa_chefia
                                   else false end
                       from seguranca_config), true);
$$;

-- ========================== MODELOS DE FLUXO =========================
create table if not exists public.fluxos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique check (length(trim(nome)) between 2 and 80),
  descricao     text check (length(descricao) <= 300),
  rotas         jsonb not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.perfis add column if not exists fluxo_id uuid references public.fluxos(id) on delete set null;
create index if not exists perfis_fluxo_idx on public.perfis (fluxo_id);

alter table public.solicitacoes
  add column if not exists rota        jsonb,
  add column if not exists etapa_atual int,
  add column if not exists etapa_nome  text,
  add column if not exists fluxo_nome  text,
  add column if not exists baixa_em    timestamptz,
  add column if not exists baixa_por   uuid references public.perfis(id) on delete set null,
  add column if not exists baixa_nome  text;
create index if not exists solicitacoes_baixa_idx on public.solicitacoes (situacao, baixa_em);

alter table public.solicitacoes drop constraint if exists solicitacoes_situacao_check;
alter table public.solicitacoes add constraint solicitacoes_situacao_check check (situacao in
  ('Aguardando assinatura','Aguardando chefia','Aguardando coordenação','Aguardando direção','Aprovado','Negado','Cancelado'));
alter table public.solicitacoes drop constraint if exists fluxo_ck;
alter table public.solicitacoes add constraint fluxo_ck
  check (fluxo is null or fluxo in ('modelo','ambos','um','saida_estagio','coordenacao','direcao'));
alter table public.solicitacoes drop constraint if exists pendentes_ck;

alter table public.assinaturas drop constraint if exists assinaturas_etapa_check;
alter table public.assinaturas add column if not exists etapa_nome text;
alter table public.assinaturas add constraint assinaturas_etapa_check check (length(etapa) between 1 and 200);

-- Rótulo legível de uma vaga
create or replace function public.rotulo_vaga_json(v jsonb) returns text
language sql stable security definer set search_path = public as $$
  select case v->>'tipo'
    when 'unidade' then case v->>'valor' when 'enfermeiro' then 'Enfermeiro responsável da unidade'
                                         when 'gerente' then 'Gerente da unidade'
                                         when 'supervisor' then 'Supervisor da unidade'
                                         else 'Chefia da unidade' end
    when 'papel' then case v->>'valor' when 'direcao' then 'Direção' when 'coordenacao' then 'Coordenação de Enfermagem'
                                       when 'diretor' then 'Diretor(a) de área' when 'rh' then 'RH'
                                       when 'supervisor' then 'Supervisor' when 'gerente' then 'Gerente'
                                       when 'enfermeiro' then 'Enfermeiro responsável' else v->>'valor' end
    when 'cargo' then 'Cargo: ' || (v->>'valor')
    when 'pessoa' then coalesce((select nome from perfis where id::text = v->>'valor'), 'Pessoa removida')
    else 'Assinatura' end;
$$;

-- Confere se o caminho montado na tela é válido
create or replace function public.validar_rotas(p jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare k text; c jsonb; e jsonb; v jsonb;
begin
  if jsonb_typeof(p) <> 'object' or p->'padrao' is null then raise exception 'O modelo precisa ter um caminho padrão'; end if;
  for k, c in select * from jsonb_each(p) loop
    if k <> 'padrao' and k not in ('ponto','folga','ferias','cancelamento','saida','estagio','transferencia') then
      raise exception 'Tipo de pedido desconhecido: %', k;
    end if;
    if jsonb_typeof(c) <> 'array' or jsonb_array_length(c) not between 1 and 6 then
      raise exception 'Cada caminho precisa ter de 1 a 6 etapas';
    end if;
    for e in select * from jsonb_array_elements(c) loop
      if length(coalesce(trim(e->>'nome'), '')) not between 1 and 60 then raise exception 'Dê um nome a cada etapa'; end if;
      if coalesce(e->>'regra', '') not in ('todos','um') then raise exception 'Regra da etapa inválida'; end if;
      if jsonb_typeof(e->'vagas') <> 'array' or jsonb_array_length(e->'vagas') not between 1 and 8 then
        raise exception 'A etapa "%" precisa de 1 a 8 assinantes', e->>'nome';
      end if;
      for v in select * from jsonb_array_elements(e->'vagas') union all select e->'substituto' where jsonb_typeof(e->'substituto') = 'object' loop
        if v->>'tipo' = 'unidade' and v->>'valor' in ('enfermeiro','gerente','supervisor') then null;
        elsif v->>'tipo' = 'papel' and v->>'valor' in ('enfermeiro','gerente','supervisor','coordenacao','diretor','rh','direcao') then null;
        elsif v->>'tipo' = 'cargo' and length(trim(coalesce(v->>'valor', ''))) between 2 and 120 then null;
        elsif v->>'tipo' = 'pessoa' and exists (select 1 from perfis where id::text = v->>'valor') then null;
        else raise exception 'Assinante inválido na etapa "%"', e->>'nome';
        end if;
      end loop;
    end loop;
  end loop;
end $$;

create or replace function public.tg_fluxo_validar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform validar_rotas(new.rotas);
  new.nome := trim(new.nome);
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    perform registrar_auditoria('Fluxo de assinatura alterado', 'fluxo', new.id::text, new.nome, diferenca(to_jsonb(old), to_jsonb(new)));
  else
    perform registrar_auditoria('Fluxo de assinatura criado', 'fluxo', new.id::text, new.nome, '{}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists fluxos_validar on public.fluxos;
create trigger fluxos_validar before insert or update on public.fluxos
  for each row execute function public.tg_fluxo_validar();

-- Caminho que vale para esta pessoa e este tipo de pedido
create or replace function public.rota_do_perfil(p_perfil uuid, p_categoria text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select coalesce(f.rotas->p_categoria, f.rotas->'padrao') from perfis p join fluxos f on f.id = p.fluxo_id
      where p.id = p_perfil and f.ativo),
    -- sem modelo: só a Direção
    '[{"nome":"Direção","regra":"um","vagas":[{"tipo":"papel","valor":"direcao"}],"substituto":null,"gozo_imediato":false}]'::jsonb);
$$;

-- Acrescenta o rótulo de cada vaga (o pedido guarda o caminho já legível)
create or replace function public.rotular_rota(p jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
    e || jsonb_build_object(
      'vagas', (select jsonb_agg(v || jsonb_build_object('rotulo', rotulo_vaga_json(v)) order by o)
                  from jsonb_array_elements(e->'vagas') with ordinality x(v, o)),
      'substituto', case when jsonb_typeof(e->'substituto') = 'object'
                         then (e->'substituto') || jsonb_build_object('rotulo', rotulo_vaga_json(e->'substituto')) end)
    order by n), '[]'::jsonb)
  from jsonb_array_elements(p) with ordinality y(e, n);
$$;

-- Para a tela "Nova solicitação": o caminho que o pedido vai fazer
create or replace function public.minha_rota(p_categoria text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when usuario_ativo() then rotular_rota(rota_do_perfil(auth.uid(), p_categoria)) end;
$$;

-- ========================= QUEM PODE ASSINAR =========================
-- Esta pessoa ocupa a vaga para um pedido desta unidade?
create or replace function public.elegivel(p_perfil uuid, p_vaga jsonb, p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis p
     where p.id = p_perfil and p.ativo
       and case p_vaga->>'tipo'
             when 'unidade' then p.papel = p_vaga->>'valor' and atua_em(p.id, p_unidade)
             when 'papel'   then p.papel = p_vaga->>'valor'
             when 'cargo'   then lower(trim(coalesce(p.cargo, ''))) = lower(trim(p_vaga->>'valor'))
             when 'pessoa'  then p.id::text = p_vaga->>'valor'
             else false end);
$$;

-- A vaga está sem ninguém disponível hoje? (ninguém elegível, ou todos de férias/afastados)
create or replace function public.vaga_vazia(p_vaga jsonb, p_unidade uuid, p_solicitante uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from perfis p
     where p.ativo and p.id <> p_solicitante and elegivel(p.id, p_vaga, p_unidade)
       and not exists (select 1 from ausencias a where a.perfil_id = p.id and hoje() between a.inicio and a.fim));
$$;

create or replace function public.motivo_vaga_vazia(p_vaga jsonb, p_unidade uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.motivo from ausencias a join perfis p on p.id = a.perfil_id
      where elegivel(p.id, p_vaga, p_unidade) and hoje() between a.inicio and a.fim
      order by a.criado_em desc limit 1),
    'ninguém disponível');
$$;

-- Participa do caminho deste pedido (pode assinar alguma etapa, ou já assinou)?
create or replace function public.participa(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select usuario_ativo() and exists (
    select 1 from solicitacoes s
     where s.id = p_id and (
       exists (select 1 from assinaturas a where a.solicitacao_id = s.id and a.por = auth.uid())
       or exists (select 1 from jsonb_array_elements(coalesce(s.rota, '[]'::jsonb)) e
                   where exists (select 1 from jsonb_array_elements(e->'vagas') v where elegivel(auth.uid(), v, s.unidade_id))
                      or (jsonb_typeof(e->'substituto') = 'object' and elegivel(auth.uid(), e->'substituto', s.unidade_id)))));
$$;

create or replace function public.pode_ver_solicitacao(p_solicitante uuid, p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select usuario_ativo() and (p_solicitante = auth.uid() or ve_unidade(p_unidade) or is_rh()
                              or ((is_direcao() or is_coordenacao()) and p_unidade is null));
$$;

drop policy if exists solicitacoes_ler on public.solicitacoes;
create policy solicitacoes_ler on public.solicitacoes for select to authenticated
  using (pode_ver_solicitacao(solicitante_id, unidade_id) or participa(id));

-- Ausências: qualquer pessoa que assine pode ter ausência registrada
create or replace function public.pode_gerir_ausencia(p_perfil uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfis t
     where t.id = p_perfil and usuario_ativo()
       and (is_direcao() or is_coordenacao()
            or t.id = auth.uid()
            or exists (select 1 from unidades u
                        where atua_em(t.id, u.id)
                          and ((meu_papel() = 'gerente' and atua_em(auth.uid(), u.id)) or supervisiona(u.id)))));
$$;

-- ======================= MODELOS PRONTOS (Circular 254) ==============
do $$
declare
  dir    jsonb := '{"nome":"Direção","regra":"um","vagas":[{"tipo":"papel","valor":"direcao"}],"substituto":null,"gozo_imediato":false}';
  chefia jsonb := '{"nome":"Chefia da unidade","regra":"todos","vagas":[{"tipo":"unidade","valor":"enfermeiro"},{"tipo":"unidade","valor":"gerente"}],"substituto":{"tipo":"unidade","valor":"supervisor"},"gozo_imediato":true}';
  chefia1 jsonb := '{"nome":"Chefia da unidade (basta uma)","regra":"um","vagas":[{"tipo":"unidade","valor":"enfermeiro"},{"tipo":"unidade","valor":"gerente"}],"substituto":{"tipo":"unidade","valor":"supervisor"},"gozo_imediato":false}';
  saida  jsonb := '{"nome":"Enfermeiro responsável","regra":"um","vagas":[{"tipo":"unidade","valor":"enfermeiro"}],"substituto":{"tipo":"unidade","valor":"gerente"},"gozo_imediato":false}';
  ger    jsonb := '{"nome":"Gerente da unidade","regra":"um","vagas":[{"tipo":"unidade","valor":"gerente"}],"substituto":{"tipo":"unidade","valor":"supervisor"},"gozo_imediato":false}';
  coord  jsonb := '{"nome":"Coordenação de Enfermagem","regra":"um","vagas":[{"tipo":"papel","valor":"coordenacao"}],"substituto":null,"gozo_imediato":false}';
  transf jsonb := '{"nome":"Coordenação / Direção","regra":"um","vagas":[{"tipo":"papel","valor":"coordenacao"},{"tipo":"papel","valor":"direcao"}],"substituto":null,"gozo_imediato":false}';
  com_dir jsonb;
begin
  -- folga, férias e cancelamento passam também pela Direção
  insert into fluxos (nome, descricao, rotas) values
  ('Atenção Básica | Cargos gerais', 'Circular 254/2026: Enfermeiro responsável e Gerente; Supervisor na ausência.',
    jsonb_build_object('padrao', jsonb_build_array(chefia),
      'folga', jsonb_build_array(chefia, dir), 'ferias', jsonb_build_array(chefia, dir), 'cancelamento', jsonb_build_array(chefia, dir),
      'saida', jsonb_build_array(saida), 'estagio', jsonb_build_array(saida), 'transferencia', jsonb_build_array(transf))),
  ('Atenção Básica | Farmácia', 'Circular 254/2026: basta uma chefia da unidade.',
    jsonb_build_object('padrao', jsonb_build_array(chefia1),
      'folga', jsonb_build_array(chefia1, dir), 'ferias', jsonb_build_array(chefia1, dir), 'cancelamento', jsonb_build_array(chefia1, dir),
      'saida', jsonb_build_array(saida), 'estagio', jsonb_build_array(saida), 'transferencia', jsonb_build_array(transf))),
  ('Atenção Básica | Enfermeiros', 'Circular 254/2026: Gerente da unidade; Supervisor na ausência.',
    jsonb_build_object('padrao', jsonb_build_array(ger),
      'folga', jsonb_build_array(ger, dir), 'ferias', jsonb_build_array(ger, dir), 'cancelamento', jsonb_build_array(ger, dir),
      'transferencia', jsonb_build_array(transf))),
  ('Atenção Básica | Gerentes', 'Circular 254/2026: Coordenação de Enfermagem avalia.',
    jsonb_build_object('padrao', jsonb_build_array(coord),
      'folga', jsonb_build_array(coord, dir), 'ferias', jsonb_build_array(coord, dir), 'cancelamento', jsonb_build_array(coord, dir),
      'transferencia', jsonb_build_array(transf))),
  ('Gestão | Direção decide', 'Supervisores, Coordenação, Diretores, RH e Direção: a Direção decide.',
    jsonb_build_object('padrao', jsonb_build_array(dir), 'transferencia', jsonb_build_array(transf)))
  on conflict (nome) do nothing;
end $$;

-- Quem ainda não tem modelo recebe o equivalente ao que valia antes
update public.perfis p set fluxo_id = (select id from public.fluxos where nome = case
    when p.papel in ('supervisor','coordenacao','diretor','rh','direcao') then 'Gestão | Direção decide'
    when p.papel = 'gerente' or p.grupo_cargo = 'gerente' then 'Atenção Básica | Gerentes'
    when p.papel = 'enfermeiro' or p.grupo_cargo = 'enfermeiro' then 'Atenção Básica | Enfermeiros'
    when p.grupo_cargo = 'farmacia' then 'Atenção Básica | Farmácia'
    else 'Atenção Básica | Cargos gerais' end)
 where p.fluxo_id is null;

-- ===================== ENVIO DO PEDIDO (usa o modelo) ================
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

  -- Caminho das assinaturas: o fluxo configurado para a pessoa (copiado no pedido;
  -- mudar o modelo depois não altera pedidos já enviados)
  new.rota := rotular_rota(rota_do_perfil(p.id, new.categoria));
  new.fluxo_nome := (select nome from fluxos where id = p.fluxo_id);
  new.etapa_atual := 0;
  new.pendentes := array(select i::text from generate_series(0, jsonb_array_length(new.rota->0->'vagas') - 1) i);
  new.etapa_nome := new.rota->0->>'nome';
  new.situacao := 'Aguardando assinatura';
  new.fluxo := 'modelo';
  new.precisa_direcao := false;
  new.baixa_em := null; new.baixa_por := null; new.baixa_nome := null;

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
    'Solicitação enviada. Primeira etapa: ' || coalesce(new.etapa_nome, 'assinatura')
      || ' (' || coalesce((select string_agg(v->>'rotulo', ', ') from jsonb_array_elements(new.rota->0->'vagas') v), '') || ')',
    case when new.referencia_protocolo is not null then 'Cancelamento do protocolo ' || new.referencia_protocolo end);
  return null;
end $$;

-- ======= PEDIDOS QUE ESTAVAM EM ANÁLISE PASSAM PARA O MODELO ==========
do $$
declare s record; v_rota jsonb; v_et int; v_pend text[];
begin
  for s in select * from solicitacoes where situacao in ('Aguardando chefia','Aguardando coordenação','Aguardando direção') loop
    v_rota := rotular_rota(rota_do_perfil(s.solicitante_id, s.categoria));
    v_et := 0;
    if s.situacao <> 'Aguardando chefia' then
      select n - 1 into v_et from jsonb_array_elements(v_rota) with ordinality x(e, n)
       where exists (select 1 from jsonb_array_elements(e->'vagas') v
                      where v->>'tipo' = 'papel' and v->>'valor' = case when s.situacao = 'Aguardando direção' then 'direcao' else 'coordenacao' end)
       order by n limit 1;
      v_et := coalesce(v_et, 0);
    end if;
    -- vagas da etapa que ainda faltam (na etapa da unidade, tira quem já assinou)
    v_pend := array(select (o - 1)::text from jsonb_array_elements(v_rota->v_et->'vagas') with ordinality x(v, o)
                     where not (s.situacao = 'Aguardando chefia' and v->>'tipo' = 'unidade'
                                and exists (select 1 from assinaturas a where a.solicitacao_id = s.id and a.etapa = v->>'valor')));
    if cardinality(v_pend) = 0 then v_pend := array['0']; end if;
    update solicitacoes set rota = v_rota, etapa_atual = v_et, pendentes = v_pend, etapa_nome = v_rota->v_et->>'nome',
           situacao = 'Aguardando assinatura', fluxo = 'modelo',
           fluxo_nome = (select f.nome from perfis p join fluxos f on f.id = p.fluxo_id where p.id = s.solicitante_id)
     where id = s.id;
  end loop;
end $$;

-- ============================ ASSINAR ================================
-- Única porta para aprovar ou negar. p_no_lugar_de = número da vaga (quem substitui escolhe).
create or replace function public.assinar(p_id uuid, p_aprovar boolean, p_obs text default null,
  p_no_lugar_de text default null, p_motivo_ausencia text default null, p_outra_ciente boolean default false,
  p_token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  s solicitacoes; eu perfis; et jsonb; vg jsonb;
  v_obs text := left(nullif(trim(p_obs), ''), 1000);
  v_motivo text := nullif(trim(p_motivo_ausencia), '');
  v_idx text; v_sub text; v_nova text; v_pend text[]; v_outra text; v_acao text; v_ass bigint;
  v_rotulo text; v_etapa_nome text; v_prox int; v_titulares text[];
begin
  if not usuario_ativo() then raise exception 'Usuário sem acesso liberado'; end if;
  select * into eu from perfis where id = auth.uid();
  select * into s from solicitacoes where id = p_id for update;
  if not found or not (pode_ver_solicitacao(s.solicitante_id, s.unidade_id) or participa(s.id)) then
    raise exception 'Solicitação não encontrada';
  end if;
  if s.solicitante_id = eu.id then raise exception 'Você não pode assinar a sua própria solicitação'; end if;
  if s.situacao <> 'Aguardando assinatura' then raise exception 'Esta solicitação já foi finalizada'; end if;
  if not p_aprovar and v_obs is null then raise exception 'Informe o motivo da negativa'; end if;
  if v_motivo is not null and v_motivo not in ('Férias','Afastamento médico') then
    raise exception 'O motivo da ausência precisa ser Férias ou Afastamento médico';
  end if;
  if not usar_autorizacao(p_token) then raise exception 'Confirme com a sua senha para assinar'; end if;

  et := s.rota->s.etapa_atual;
  v_etapa_nome := et->>'nome';
  v_pend := s.pendentes;
  v_titulares := array(select i from unnest(v_pend) i where elegivel(eu.id, et->'vagas'->(i::int), s.unidade_id));

  if cardinality(v_titulares) > 0 then
    -- Titular de uma vaga pendente
    v_idx := case when p_no_lugar_de = any(v_titulares) then p_no_lugar_de else v_titulares[1] end;
    vg := et->'vagas'->(v_idx::int);
    v_rotulo := coalesce(vg->>'rotulo', rotulo_vaga_json(vg));

  elsif jsonb_typeof(et->'substituto') = 'object' and elegivel(eu.id, et->'substituto', s.unidade_id) then
    -- Substituto de uma vaga ausente
    v_idx := coalesce(nullif(p_no_lugar_de, ''), case when cardinality(v_pend) = 1 then v_pend[1] end);
    if v_idx is null or not v_idx = any(v_pend) then raise exception 'Indique no lugar de quem você assina'; end if;
    vg := et->'vagas'->(v_idx::int);
    if et->>'regra' = 'um' then
      if v_motivo is null and exists (select 1 from unnest(v_pend) i where not vaga_vazia(et->'vagas'->(i::int), s.unidade_id, s.solicitante_id)) then
        raise exception 'Nesta etapa basta uma assinatura: o substituto só assina com todos os titulares ausentes. Informe o motivo da ausência.';
      end if;
    elsif v_motivo is null and not vaga_vazia(vg, s.unidade_id, s.solicitante_id) then
      raise exception 'O substituto só assina na ausência de % (férias ou afastamento médico). Informe o motivo da ausência.',
        coalesce(vg->>'rotulo', rotulo_vaga_json(vg));
    end if;
    v_rotulo := coalesce(vg->>'rotulo', rotulo_vaga_json(vg));
    v_sub := coalesce(et->'substituto'->>'rotulo', rotulo_vaga_json(et->'substituto')) || ' no lugar de ' || v_rotulo
             || ' (' || coalesce(v_motivo, motivo_vaga_vazia(vg, s.unidade_id)) || ')';

  elsif eu.papel = 'direcao' then
    -- Direção decide direto (ninguém para assinar a etapa): exige o motivo
    if v_obs is null then
      raise exception 'Explique por que a Direção decide sem as assinaturas pendentes (ex.: unidade sem chefia)';
    end if;
    v_rotulo := 'Direção (decisão direta)';
    v_sub := 'Decisão direta da Direção, sem: ' || coalesce((select string_agg(coalesce(et->'vagas'->(i::int)->>'rotulo', ''), ', ') from unnest(v_pend) i), v_etapa_nome)
             || case when s.etapa_atual + 1 < jsonb_array_length(s.rota) then ' e as etapas seguintes' else '' end;
    v_nova := case when p_aprovar then 'Aprovado' else 'Negado' end;
    v_pend := '{}';
  else
    raise exception 'Esta solicitação não está aguardando a sua assinatura';
  end if;

  if v_nova is null then
    if not p_aprovar then
      v_nova := 'Negado'; v_pend := '{}';
    else
      v_pend := array_remove(v_pend, v_idx);
      if et->>'regra' = 'um' then v_pend := '{}'; end if;
      -- Folga para gozo imediato: assina pelas duas, com a outra chefia ausente e ciente
      if p_outra_ciente then
        v_outra := v_pend[1];
        if not (coalesce((et->>'gozo_imediato')::boolean, false) and s.categoria = 'folga' and s.gozo_imediato
                and et->>'regra' = 'todos' and v_sub is null and cardinality(v_pend) = 1) then
          raise exception 'A assinatura única vale só para folga de gozo imediato, nas etapas que permitem';
        end if;
        if v_motivo is null and not vaga_vazia(et->'vagas'->(v_outra::int), s.unidade_id, s.solicitante_id) then
          raise exception 'A assinatura única é para quando a outra chefia está ausente. Informe o motivo da ausência.';
        end if;
        v_sub := 'Assinou também por ' || coalesce(et->'vagas'->(v_outra::int)->>'rotulo', '') || ' (folga para gozo imediato; ausente por '
                 || coalesce(v_motivo, motivo_vaga_vazia(et->'vagas'->(v_outra::int), s.unidade_id)) || ' e ciente, com consenso prévio)';
        v_pend := '{}';
      end if;
      v_nova := 'Aguardando assinatura';
    end if;
  end if;

  insert into assinaturas (solicitacao_id, etapa, etapa_nome, decisao, por, nome, papel, substituicao, obs,
                           metodo, hash_documento, ip, aparelho, criado_em)
  values (p_id, v_rotulo, v_etapa_nome, case when p_aprovar then 'Aprovado' else 'Negado' end, eu.id, eu.nome, eu.papel, v_sub, v_obs,
          'senha', hash_documento(p_id), ip_cliente(), aparelho_cliente(), now())
  returning id into v_ass;
  update assinaturas set hash_assinatura = hash_da_assinatura(a) from assinaturas a where a.id = v_ass and assinaturas.id = v_ass;

  -- Etapa concluída: passa para a próxima (ou aprova no fim)
  v_prox := s.etapa_atual;
  if v_nova = 'Aguardando assinatura' and cardinality(v_pend) = 0 then
    v_prox := s.etapa_atual + 1;
    if v_prox >= jsonb_array_length(s.rota) then
      v_nova := 'Aprovado';
    else
      v_pend := array(select i::text from generate_series(0, jsonb_array_length(s.rota->v_prox->'vagas') - 1) i);
    end if;
  end if;

  update solicitacoes set situacao = v_nova, pendentes = v_pend,
    etapa_atual = case when v_nova = 'Aguardando assinatura' then v_prox else etapa_atual end,
    etapa_nome = case when v_nova = 'Aguardando assinatura' then s.rota->v_prox->>'nome' else etapa_nome end
  where id = p_id;

  v_acao := (case when p_aprovar then 'Assinada' else 'Negada' end) || ' por ' || v_rotulo
            || case when v_sub is not null then ' | ' || v_sub else '' end
            || case when v_nova = 'Aguardando assinatura' and v_prox = s.etapa_atual then '. Aguarda as outras assinaturas da etapa'
                    when v_nova = 'Aguardando assinatura' then '. Próxima etapa: ' || (s.rota->v_prox->>'nome')
                    when v_nova = 'Aprovado' then '. Aprovada'
                    else '' end;
  perform registrar_historico(p_id, v_acao, v_obs);

  if v_nova = 'Aprovado' then perform aplicar_aprovacao(p_id); end if;
  return v_nova;
end $$;

-- Ao aprovar de vez: cancelamento e férias de quem assina viram ausência
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
    if t.papel <> 'funcionario' then
      insert into ausencias (perfil_id, perfil_nome, papel, unidade_id, inicio, fim, motivo, observacao, solicitacao_id, registrado_por, registrado_nome)
      values (t.id, t.nome, t.papel, t.unidade_id, s.data_inicio, s.data_fim, 'Férias', 'Férias aprovadas ' || s.protocolo, s.id,
              auth.uid(), (select nome from perfis where id = auth.uid()));
    end if;
  end if;
end $$;

-- ========================= FILA DE ASSINATURAS =======================
drop function if exists public.fila_assinaturas();
create or replace function public.fila_assinaturas()
returns table (id uuid, como text, vagas text[], rotulos text[], ausentes text[], precisa_motivo boolean)
language plpgsql stable security definer set search_path = public as $$
declare eu perfis; s record; et jsonb; v_tit text[]; v_aus text[];
begin
  select * into eu from perfis where perfis.id = auth.uid();
  if eu.id is null or not usuario_ativo() then return; end if;
  for s in select * from solicitacoes x where x.situacao = 'Aguardando assinatura' and x.solicitante_id <> eu.id order by x.criado_em loop
    et := s.rota->s.etapa_atual;
    v_tit := array(select i from unnest(s.pendentes) i where elegivel(eu.id, et->'vagas'->(i::int), s.unidade_id));
    v_aus := array(select i from unnest(s.pendentes) i where vaga_vazia(et->'vagas'->(i::int), s.unidade_id, s.solicitante_id));
    id := s.id; ausentes := v_aus;
    if cardinality(v_tit) > 0 then
      como := 'titular'; vagas := v_tit; precisa_motivo := false;
    elsif jsonb_typeof(et->'substituto') = 'object' and elegivel(eu.id, et->'substituto', s.unidade_id) then
      como := 'substituto'; vagas := s.pendentes;
      precisa_motivo := case when et->>'regra' = 'um' then cardinality(v_aus) < cardinality(s.pendentes) else cardinality(v_aus) = 0 end;
    elsif eu.papel = 'direcao' then
      como := 'direcao_direta'; vagas := s.pendentes; precisa_motivo := true;
    else
      continue;
    end if;
    rotulos := array(select coalesce(et->'vagas'->(i::int)->>'rotulo', '') from unnest(vagas) i);
    return next;
  end loop;
end $$;

-- =============================== RH ==================================
create or replace function public.dar_baixa(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int; v_nome text;
begin
  if not (is_rh() or is_direcao()) then raise exception 'Só o RH ou a Direção dá baixa'; end if;
  if cardinality(p_ids) > 500 then raise exception 'No máximo 500 pedidos por vez'; end if;
  v_nome := (select nome from perfis where id = auth.uid());
  with feitos as (
    update solicitacoes set baixa_em = now(), baixa_por = auth.uid(), baixa_nome = v_nome
     where id = any(p_ids) and situacao = 'Aprovado' and baixa_em is null
    returning id)
  insert into historico (solicitacao_id, acao, detalhe, usuario_id, usuario_nome)
  select id, 'Baixa no RH', null, auth.uid(), v_nome from feitos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.desfazer_baixa(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_rh() or is_direcao()) then raise exception 'Só o RH ou a Direção desfaz a baixa'; end if;
  update solicitacoes set baixa_em = null, baixa_por = null, baixa_nome = null where id = p_id and baixa_em is not null;
  if found then perform registrar_historico(p_id, 'Baixa no RH desfeita', null); end if;
end $$;

-- ======================== REGRAS DE ACESSO ===========================
alter table public.fluxos enable row level security;
drop policy if exists fluxos_ler on public.fluxos;
drop policy if exists fluxos_direcao on public.fluxos;
create policy fluxos_ler on public.fluxos for select to authenticated using (usuario_ativo());
create policy fluxos_direcao on public.fluxos for all to authenticated using (is_direcao()) with check (is_direcao());

revoke all on public.fluxos from anon, authenticated;
grant select, insert, update, delete on public.fluxos to authenticated;
grant all on public.fluxos to service_role;
grant update (nome, cargo, papel, grupo_cargo, unidade_id, ativo, deve_trocar_senha, fluxo_id) on public.perfis to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.assinar(uuid, boolean, text, text, text, boolean, text) to authenticated;
grant execute on function public.fila_assinaturas(), public.minha_rota(text), public.dar_baixa(uuid[]), public.desfazer_baixa(uuid),
  public.is_rh(), public.participa(uuid), public.elegivel(uuid, jsonb, uuid), public.rotulo_vaga_json(jsonb),
  public.confirmar_senha(text), public.decidir_chefia(uuid, boolean, text), public.decidir_direcao(uuid, boolean, text),
  public.registrar_ausencia(uuid, date, date, text, text), public.remover_ausencia(uuid), public.cancelar_solicitacao(uuid, text),
  public.minha_seguranca(), public.usuario_ativo(), public.is_direcao(), public.is_chefia(), public.is_coordenacao(), public.meu_papel(),
  public.supervisiona(uuid), public.ve_unidade(uuid), public.atua_em(uuid, uuid), public.minha_unidade(), public.mfa_ok(text),
  public.pode_ver_solicitacao(uuid, uuid), public.hoje()
  to authenticated;
grant execute on function public.verificar_documento(text) to anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Conferência: quantas pessoas em cada modelo
select f.nome, count(p.id) as pessoas from public.fluxos f left join public.perfis p on p.fluxo_id = f.id group by f.nome order by f.nome;

commit;
