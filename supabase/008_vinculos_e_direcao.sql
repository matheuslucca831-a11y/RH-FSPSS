-- =====================================================================
-- SIGER RH | FSPSS
-- 008_vinculos_e_direcao.sql
-- Rodar inteiro no SQL Editor, depois do 007. Pode rodar de novo sem problema.
--
-- 1. CHEFIA EM MAIS DE UMA UNIDADE: Enfermeiro responsável e Gerente podem ser
--    vinculados a outras unidades além da lotação (tabela "supervisao", que passa
--    a guardar os vínculos de qualquer chefia). Eles assinam e veem os pedidos
--    de todas as unidades vinculadas.
-- 2. DECISÃO DIRETA DA DIREÇÃO: quando a unidade fica sem chefia (ou a
--    Coordenação não pode avaliar), a Direção aprova ou nega direto, sem as
--    assinaturas pendentes. O motivo é obrigatório e fica no histórico e no
--    documento assinado.
-- =====================================================================

begin;

-- ===================== VÍNCULOS COM UNIDADES =========================
-- A pessoa atua nesta unidade? (lotação ou unidade vinculada)
create or replace function public.atua_em(p_perfil uuid, p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_unidade is not null and (
    exists (select 1 from perfis where id = p_perfil and unidade_id = p_unidade)
    or exists (select 1 from supervisao where supervisor_id = p_perfil and unidade_id = p_unidade));
$$;

create or replace function public.ve_unidade(p_unidade uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_direcao() or is_coordenacao()
      or (is_chefia() and atua_em(auth.uid(), p_unidade))
      or supervisiona(p_unidade);
$$;

-- A vaga (Enfermeiro ou Gerente) da unidade está sem ninguém hoje?
create or replace function public.vaga_ausente(p_unidade uuid, p_papel text, p_dia date default null) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from perfis p
     where p.papel = p_papel and p.ativo and atua_em(p.id, p_unidade)
       and not exists (select 1 from ausencias a
                        where a.perfil_id = p.id and coalesce(p_dia, hoje()) between a.inicio and a.fim));
$$;

create or replace function public.motivo_ausencia(p_unidade uuid, p_papel text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.motivo from ausencias a join perfis p on p.id = a.perfil_id
      where p.papel = p_papel and atua_em(p.id, p_unidade) and hoje() between a.inicio and a.fim
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
            or exists (select 1 from unidades u
                        where atua_em(t.id, u.id)
                          and ((meu_papel() = 'gerente' and atua_em(auth.uid(), u.id)) or supervisiona(u.id)))));
$$;

-- Ausências e perfis: quem vê uma unidade vê também as chefias vinculadas a ela
drop policy if exists ausencias_ler on public.ausencias;
create policy ausencias_ler on public.ausencias for select to authenticated
  using (usuario_ativo() and (perfil_id = auth.uid() or is_direcao() or is_coordenacao()
         or exists (select 1 from unidades u where ve_unidade(u.id) and atua_em(perfil_id, u.id))));

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated
  using (id = auth.uid() or is_direcao() or is_coordenacao() or ve_unidade(unidade_id)
         or (papel in ('enfermeiro','gerente','supervisor')
             and exists (select 1 from supervisao sv where sv.supervisor_id = perfis.id and ve_unidade(sv.unidade_id))));

-- O perfil carregado pelo site traz também as unidades vinculadas
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

-- ===================== ASSINATURA (com os dois ajustes) ==============
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

  -- Direção decide direto (unidade sem chefia, Coordenação indisponível...): exige o motivo
  if eu.papel = 'direcao' and (s.situacao = 'Aguardando chefia'
                               or (s.situacao = 'Aguardando coordenação' and s.categoria <> 'transferencia')) then
    if v_obs is null then
      raise exception 'Explique por que a Direção decide sem as assinaturas pendentes (ex.: unidade sem chefia)';
    end if;
    v_etapa := 'direcao';
    v_sub := 'Decisão direta da Direção, sem ' || case when s.situacao = 'Aguardando chefia'
               then 'as assinaturas da unidade (' || coalesce(nullif(array_to_string(array(select rotulo_vaga(x) from unnest(v_pend) x), ' e '), ''), 'chefia') || ')'
               else 'a avaliação da Coordenação de Enfermagem' end;
    v_nova := case when p_aprovar then 'Aprovado' else 'Negado' end;
    v_pend := '{}';

  elsif s.situacao = 'Aguardando chefia' then
    v_etapa := null;
    -- Titular da vaga (Enfermeiro responsável ou Gerente da própria unidade)
    if eu.papel in ('enfermeiro','gerente') and atua_em(eu.id, s.unidade_id) and eu.papel = any(v_pend) then
      v_vaga := eu.papel;
    -- Gerente no lugar do Enfermeiro: só saída antecipada e estágio
    elsif eu.papel = 'gerente' and atua_em(eu.id, s.unidade_id) and s.fluxo = 'saida_estagio' and 'enfermeiro' = any(v_pend) then
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

-- ======================= FILA DE ASSINATURAS ==========================
-- 'direcao_direta' aparece na aba "Substituição" da Direção (precisa do motivo)
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
             and atua_em(eu.id, s.unidade_id) and eu.papel = any(s.pendentes)
          then 'titular'
        when s.situacao = 'Aguardando chefia' and eu.papel = 'gerente' and atua_em(eu.id, s.unidade_id)
             and s.fluxo = 'saida_estagio' and 'enfermeiro' = any(s.pendentes)
          then 'gerente_substituto'
        when s.situacao = 'Aguardando chefia' and eu.papel = 'supervisor' and s.fluxo <> 'saida_estagio'
             and exists (select 1 from supervisao sv where sv.supervisor_id = eu.id and sv.unidade_id = s.unidade_id)
          then 'supervisor'
        when s.situacao = 'Aguardando coordenação' and (eu.papel = 'coordenacao' or (eu.papel = 'direcao' and s.categoria = 'transferencia'))
          then 'coordenacao'
        when s.situacao = 'Aguardando direção' and eu.papel = 'direcao'
          then 'direcao'
        when eu.papel = 'direcao' and (s.situacao = 'Aguardando chefia' or s.situacao = 'Aguardando coordenação')
          then 'direcao_direta'
      end as como,
      case
        when eu.papel in ('enfermeiro','gerente') and eu.papel = any(s.pendentes) then array[eu.papel]
        when eu.papel = 'gerente' then array['enfermeiro']
        when eu.papel = 'supervisor' then s.pendentes
        else '{}'::text[]
      end as vagas,
      case
        when eu.papel = 'direcao' and (s.situacao = 'Aguardando chefia'
             or (s.situacao = 'Aguardando coordenação' and s.categoria <> 'transferencia')) then true
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

grant execute on function public.atua_em(uuid, uuid) to authenticated;
grant execute on function public.assinar(uuid, boolean, text, text, text, boolean, text) to authenticated;
grant execute on function public.fila_assinaturas() to authenticated;
grant execute on function public.ve_unidade(uuid), public.minha_seguranca() to authenticated;
revoke execute on function public.atua_em(uuid, uuid), public.vaga_ausente(uuid, text, date), public.motivo_ausencia(uuid, text),
  public.pode_gerir_ausencia(uuid) from public, anon;

commit;
