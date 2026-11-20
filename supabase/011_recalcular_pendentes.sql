-- =====================================================================
-- SIGER RH | FSPSS
-- 011_recalcular_pendentes.sql: quando o fluxo de uma pessoa muda (troca de
-- fluxo em Usuários, edição/desativação/exclusão do fluxo), os pedidos dela
-- que ainda aguardam assinatura passam a seguir o fluxo novo.
--   * As assinaturas já feitas continuam valendo: cada uma conta para a vaga
--     do fluxo novo que a pessoa que assinou ocupa, ou como substituto quando
--     a etapa nova tem o mesmo substituto (a mesma pessoa não conta em duas
--     etapas). Quem já fez o pedido seguir só com a assinatura dele(a), com
--     justificativa, cobre a etapa inteira em que ocupa uma vaga.
--   * O pedido para na primeira etapa que ainda falta. Se as assinaturas já
--     feitas cobrem o fluxo novo inteiro, o pedido é aprovado.
--   * Tudo fica no histórico do pedido.
-- Pedidos já aprovados, negados ou cancelados não mudam.
-- Rodar depois do 010. Pode rodar de novo sem problema.
-- =====================================================================

create or replace function public.recalcular_pedido(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s solicitacoes; v_rota jsonb; e jsonb; i int; n int; k int;
  v_usados uuid[] := '{}'; v_ok text[]; v_falta text[]; v_quem uuid; v_pend text[]; v_et int := null;
  v_etapa uuid[]; v_resto text[]; k_txt text;
  v_fluxo text; v_aprovar boolean := false;
begin
  select * into s from solicitacoes where id = p_id for update;
  if not found or s.situacao <> 'Aguardando assinatura' then return; end if;

  v_rota := rotular_rota(rota_do_perfil(s.solicitante_id, s.categoria));
  v_fluxo := (select f.nome from perfis p join fluxos f on f.id = p.fluxo_id and f.ativo where p.id = s.solicitante_id);
  if v_rota = s.rota and v_fluxo is not distinct from s.fluxo_nome then return; end if;

  n := jsonb_array_length(v_rota);
  for i in 0 .. n - 1 loop
    e := v_rota->i;
    v_ok := '{}'; v_falta := '{}'; v_etapa := '{}';
    for k in 0 .. jsonb_array_length(e->'vagas') - 1 loop
      -- alguém que já aprovou este pedido ocupa esta vaga?
      select a.por into v_quem from assinaturas a
       where a.solicitacao_id = s.id and a.decisao = 'Aprovado' and a.por is not null and a.por <> s.solicitante_id
         and not a.por = any(v_usados) and elegivel(a.por, e->'vagas'->k, s.unidade_id)
       order by a.criado_em limit 1;
      if v_quem is not null then
        v_ok := v_ok || k::text; v_usados := v_usados || v_quem; v_etapa := v_etapa || v_quem;
      else
        v_falta := v_falta || k::text;
      end if;
    end loop;
    -- quem assinou como substituto cobre uma vaga que falta (se a etapa nova tem esse substituto)
    if cardinality(v_falta) > 0 and jsonb_typeof(e->'substituto') = 'object' then
      v_resto := '{}';
      foreach k_txt in array v_falta loop
        select a.por into v_quem from assinaturas a
         where a.solicitacao_id = s.id and a.decisao = 'Aprovado' and a.por is not null and a.por <> s.solicitante_id
           and not a.por = any(v_usados) and a.substituicao is not null and elegivel(a.por, e->'substituto', s.unidade_id)
         order by a.criado_em limit 1;
        if v_quem is not null then
          v_ok := v_ok || k_txt; v_usados := v_usados || v_quem; v_etapa := v_etapa || v_quem;
        else
          v_resto := v_resto || k_txt;
        end if;
      end loop;
      v_falta := v_resto;
    end if;
    -- quem já fez o pedido seguir só com a assinatura dele(a) cobre a etapa inteira
    if cardinality(v_falta) > 0 and exists (
         select 1 from assinaturas a where a.solicitacao_id = s.id and a.decisao = 'Aprovado' and a.por = any(v_etapa)
            and (a.substituicao like 'Seguiu só%' or a.substituicao like 'Assinou também%')) then
      v_falta := '{}';
    end if;
    if (e->>'regra' = 'um' and cardinality(v_ok) > 0) or cardinality(v_falta) = 0 then
      continue;  -- etapa já coberta pelas assinaturas feitas
    end if;
    v_et := i;
    v_pend := case when e->>'regra' = 'um' then array(select g::text from generate_series(0, jsonb_array_length(e->'vagas') - 1) g)
                   else v_falta end;
    exit;
  end loop;

  if v_et is null then
    v_aprovar := true;
    update solicitacoes set rota = v_rota, fluxo_nome = v_fluxo, situacao = 'Aprovado', pendentes = '{}' where id = s.id;
    perform registrar_historico(s.id, 'Fluxo de assinatura atualizado' || coalesce(' (' || v_fluxo || ')', ' (sem fluxo: só a Direção)')
      || '. As assinaturas já feitas cobrem o fluxo novo: aprovada', null);
    perform aplicar_aprovacao(s.id);
  else
    update solicitacoes set rota = v_rota, fluxo_nome = v_fluxo, etapa_atual = v_et, etapa_nome = v_rota->v_et->>'nome', pendentes = v_pend
     where id = s.id;
    perform registrar_historico(s.id, 'Fluxo de assinatura atualizado' || coalesce(' (' || v_fluxo || ')', ' (sem fluxo: só a Direção)')
      || '. Agora aguarda: ' || (v_rota->v_et->>'nome') || ' (etapa ' || (v_et + 1) || ' de ' || n || ')', null);
  end if;
end $$;

create or replace function public.recalcular_pedidos_da_pessoa(p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from solicitacoes where solicitante_id = p_perfil and situacao = 'Aguardando assinatura' loop
    perform recalcular_pedido(r.id);
  end loop;
end $$;

-- Troca de fluxo da pessoa (inclui fluxo excluído: o banco limpa o fluxo_id)
create or replace function public.tg_perfil_fluxo_mudou() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recalcular_pedidos_da_pessoa(new.id);
  return null;
end $$;
drop trigger if exists perfis_fluxo_mudou on public.perfis;
create trigger perfis_fluxo_mudou after update of fluxo_id on public.perfis
  for each row when (old.fluxo_id is distinct from new.fluxo_id)
  execute function public.tg_perfil_fluxo_mudou();

-- Fluxo editado ou desativado/reativado: vale para os pedidos pendentes de quem usa o fluxo
create or replace function public.tg_fluxo_mudou() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select s.id from solicitacoes s join perfis p on p.id = s.solicitante_id
            where p.fluxo_id = new.id and s.situacao = 'Aguardando assinatura' loop
    perform recalcular_pedido(r.id);
  end loop;
  return null;
end $$;
drop trigger if exists fluxos_mudou on public.fluxos;
create trigger fluxos_mudou after update on public.fluxos
  for each row when (old.rotas is distinct from new.rotas or old.ativo is distinct from new.ativo)
  execute function public.tg_fluxo_mudou();

revoke execute on function public.recalcular_pedido(uuid), public.recalcular_pedidos_da_pessoa(uuid) from public, anon, authenticated;
