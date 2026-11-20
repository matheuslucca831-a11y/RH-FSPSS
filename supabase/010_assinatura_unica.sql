-- =====================================================================
-- SIGER RH | FSPSS
-- 010_assinatura_unica.sql: em etapas com mais de um assinante, quem assina
-- pode fazer o pedido seguir só com a assinatura dele(a), com justificativa
-- obrigatória (fica no histórico e no documento assinado). Vale para todos os
-- fluxos, inclusive a Atenção Básica. A folga para gozo imediato continua igual.
-- Rodar depois do 009. Pode rodar de novo sem problema.
-- =====================================================================

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
      -- Seguir só com esta assinatura (pula as outras da etapa):
      --  a) folga para gozo imediato com a outra chefia ausente e ciente (Circular 254); ou
      --  b) qualquer pedido, com justificativa obrigatória (fica no histórico e no documento)
      if p_outra_ciente then
        if not (et->>'regra' = 'todos' and v_sub is null and cardinality(v_pend) >= 1) then
          raise exception 'Seguir só com a sua assinatura vale para quem assina como titular, numa etapa em que faltam outras assinaturas';
        end if;
        v_outra := v_pend[1];
        if v_obs is null and coalesce((et->>'gozo_imediato')::boolean, false) and s.categoria = 'folga' and s.gozo_imediato
           and cardinality(v_pend) = 1
           and (v_motivo is not null or vaga_vazia(et->'vagas'->(v_outra::int), s.unidade_id, s.solicitante_id)) then
          v_sub := 'Assinou também por ' || coalesce(et->'vagas'->(v_outra::int)->>'rotulo', '') || ' (folga para gozo imediato; ausente por '
                   || coalesce(v_motivo, motivo_vaga_vazia(et->'vagas'->(v_outra::int), s.unidade_id)) || ' e ciente, com consenso prévio)';
        elsif v_obs is null then
          raise exception 'Escreva a justificativa para o pedido seguir só com a sua assinatura';
        else
          v_sub := left('Seguiu só com esta assinatura, sem ' || coalesce((select string_agg(coalesce(et->'vagas'->(i::int)->>'rotulo', ''), ' e ') from unnest(v_pend) i), 'as outras')
                   || ' (justificativa na observação)', 300);
        end if;
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

grant execute on function public.assinar(uuid, boolean, text, text, text, boolean, text) to authenticated;
