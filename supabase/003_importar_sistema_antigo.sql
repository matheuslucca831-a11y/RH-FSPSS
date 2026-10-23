-- =====================================================================
-- SIGER RH — FSPSS
-- 003_importar_sistema_antigo.sql — OPCIONAL
--
-- Traz para o sistema novo o que existia no antigo (tabelas legado_*):
--   unidades → unidades
--   usuarios → perfis   (só quem já tem login em Authentication > Users)
--   ocorrencias + logs_atividades → solicitacoes + historico
--
-- Rode depois do 000 e do 001. Pode rodar mais de uma vez: o que já foi
-- importado não é duplicado. Os anexos antigos continuam no bucket "anexos"
-- (agora privado, pelo 000) e abrem pelo sistema para quem tem permissão.
-- Todos os usuários importados vão precisar trocar a senha no primeiro acesso
-- (as senhas do sistema antigo eram fracas, como 1234).
-- =====================================================================

begin;

-- 1) Unidades
insert into public.unidades (nome)
select distinct trim(nome::text) from public.legado_unidades where nullif(trim(nome::text), '') is not null
on conflict (nome) do nothing;

insert into public.unidades (nome)
select distinct trim(unidade::text) from public.legado_usuarios where nullif(trim(unidade::text), '') is not null
on conflict (nome) do nothing;

-- Quem não tinha unidade (e não é Direção) fica em "A definir" para a Direção ajustar
insert into public.unidades (nome, sigla)
select 'A definir', '—'
where exists (
  select 1 from public.legado_usuarios u
  where nullif(trim(u.unidade::text), '') is null and coalesce(u.cargo::text, '') <> 'Gestor Máximo'
)
on conflict (nome) do nothing;

-- 2) Perfis (precisa existir o login em auth.users com o mesmo e-mail)
insert into public.perfis (id, nome, matricula, email, cargo, papel, unidade_id, deve_trocar_senha)
select distinct on (a.id)
  a.id,
  trim(u.nome::text),
  regexp_replace(split_part(lower(u.email::text), '@', 1), '[^a-z0-9._]', '', 'g'),
  lower(u.email::text),
  u.cargo::text,
  case u.cargo::text when 'Gestor Máximo' then 'direcao'
                     when 'Enfermeiro'    then 'chefia'
                     when 'Supervisor'    then 'chefia'
                     else 'funcionario' end,
  case when u.cargo::text = 'Gestor Máximo' then null
       else coalesce((select id from public.unidades where nome = trim(u.unidade::text)),
                     (select id from public.unidades where nome = 'A definir')) end,
  true
from public.legado_usuarios u
join auth.users a on lower(a.email) = lower(trim(u.email::text))
on conflict do nothing;

-- 3) Ocorrências → solicitações (sem os gatilhos, que exigem um usuário logado)
alter table public.solicitacoes disable trigger solicitacoes_insert;
alter table public.solicitacoes disable trigger solicitacoes_criada;

with base as (
  select
    o.id::text                                   as id_antigo,
    p.id                                         as solicitante_id,
    p.nome, p.matricula, p.cargo, p.unidade_id,
    coalesce(o.motivo::text, '')                 as motivo,
    coalesce(o.status::text, '')                 as status,
    coalesce(o.data::text, '')                   as data_txt,
    coalesce(o.horarios::text, '')               as horarios,
    nullif(trim(o.detalhes::text), '')           as justificativa,
    nullif(trim(o.anexo::text), '')              as anexo,
    nullif(trim(o.aprovado_por::text), '')       as aprovado_por,
    coalesce(o.arquivado::text, '') in ('Sim', 'true', 't') as arquivado
  from public.legado_ocorrencias o
  join public.perfis p on lower(p.email) = lower(trim(o.email_solicitante::text))
  where not exists (select 1 from public.solicitacoes s where s.id_antigo = o.id::text)
),
mapeado as (
  select b.*,
    case when b.motivo ilike 'Folga%' then 'folga' else 'ponto' end as categoria,
    case
      when b.motivo ilike 'Folga%' then case
        when b.motivo ilike '%BANCO DE HORAS%'      then 'Banco de horas'
        when b.motivo ilike '%FOLGA ABONADA%'       then 'Folga abonada (Art. 56, XII)'
        when b.motivo ilike '%ELEITORAL%'           then 'Serviço eleitoral (TRE)'
        when b.motivo ilike '%CAMPANHA%'            then 'Campanha de vacinação'
        when b.motivo ilike '%NATAL%'               then 'Abono natalício (Art. 56, X)'
        else 'Outros' end
      when b.motivo ilike 'Atestado%'       then 'Atestado'
      when b.motivo ilike 'Esquecimento%'   then 'Esquecimento'
      when b.motivo ilike 'Erro no Rel%'    then 'Erro no relógio'
      else 'Outros' end as tipo,
    case when b.motivo ilike 'Atestado%' then case
        when b.motivo ilike '%Acompanhante%'   then 'Acompanhante'
        when b.motivo ilike '%Comparecimento%' then 'Comparecimento'
        when b.motivo ilike '%Doa%'            then 'Doação de sangue'
        else 'Médico' end end as subtipo,
    case
      when b.status ilike '%Indeferido%' or b.status ilike '%Negado%' then 'Negado'
      when b.status ilike '%Deferido%'   or b.status ilike '%Aprovado%' then 'Aprovado'
      when b.status ilike '%Dire%'       then 'Aguardando direção'
      else 'Aguardando chefia' end as situacao,
    b.status ilike '%deferido%' as decidido_direcao,
    (regexp_match(b.data_txt, '(\d{4}-\d{2}-\d{2})'))[1]::date                       as di,
    (regexp_match(b.data_txt, '\d{4}-\d{2}-\d{2}.*?(\d{4}-\d{2}-\d{2})'))[1]::date   as df
  from base b
),
horas as (
  select m.*,
    (select array_agg(case when x ~ '^\d{2}:\d{2}$' and x <> '00:00' then x::time end order by n)
       from unnest(string_to_array(m.horarios, '|')) with ordinality as t(raw, n), lateral (select trim(raw) as x) y) as h
  from mapeado m
)
insert into public.solicitacoes (
  protocolo, categoria, tipo, subtipo, data_inicio, data_fim,
  entrada, saida_almoco, retorno_almoco, saida,
  justificativa, anexo_bucket, anexo_path,
  solicitante_id, solicitante_nome, solicitante_matricula, solicitante_cargo, unidade_id, unidade_nome,
  situacao,
  chefia_decisao, chefia_nome,
  direcao_decisao, direcao_nome,
  arquivado, arquivado_em, id_antigo
)
select
  public.ano_atual() || '-' || lpad(public.proximo_numero('protocolo', public.ano_atual())::text, 4, '0'),
  h.categoria, h.tipo, h.subtipo,
  coalesce(h.di, current_date), greatest(coalesce(h.df, h.di, current_date), coalesce(h.di, current_date)),
  case when h.categoria = 'ponto' and h.tipo <> 'Atestado' then h.h[1] end,
  case when h.categoria = 'ponto' and h.tipo <> 'Atestado' then h.h[2] end,
  case when h.categoria = 'ponto' and h.tipo <> 'Atestado' then h.h[3] end,
  case when h.categoria = 'ponto' and h.tipo <> 'Atestado' then h.h[4] end,
  h.justificativa,
  'anexos',
  nullif(replace(substring(h.anexo from '/object/(?:public|sign|authenticated)/anexos/([^?]+)'), '%20', ' '), ''),
  h.solicitante_id, h.nome, h.matricula, h.cargo, h.unidade_id,
  (select nome from public.unidades where id = h.unidade_id),
  h.situacao,
  case when h.situacao = 'Aguardando chefia' then null
       when h.decidido_direcao or h.situacao = 'Aguardando direção' then 'Aprovado'
       else h.situacao end,
  case when h.situacao = 'Aguardando chefia' then null
       else coalesce(nullif(regexp_replace(split_part(coalesce(h.aprovado_por, ''), ' / ', 1), '\s*\(.*\)$', ''), 'Direção'), 'Chefia') end,
  case when h.decidido_direcao then h.situacao end,
  case when h.decidido_direcao then 'Direção' end,
  h.arquivado and h.situacao in ('Aprovado','Negado'),
  case when h.arquivado and h.situacao in ('Aprovado','Negado') then now() end,
  h.id_antigo
from horas h
order by lpad(h.id_antigo, 20, '0');

alter table public.solicitacoes enable trigger solicitacoes_insert;
alter table public.solicitacoes enable trigger solicitacoes_criada;

-- 4) Histórico: o que veio do log antigo + marca de importação
insert into public.historico (solicitacao_id, acao, usuario_nome, criado_em)
select s.id, l.acao::text, l.quem_fez::text,
  case when l.created_at::text ~ '^\d{2}/\d{2}/\d{4}'
       then to_timestamp(l.created_at::text, 'DD/MM/YYYY HH24:MI:SS')::timestamp at time zone 'America/Sao_Paulo'
       else l.created_at::text::timestamptz end
from public.legado_logs_atividades l
join public.solicitacoes s on s.id_antigo = l.ocorrencia_id::text
where not exists (select 1 from public.historico h where h.solicitacao_id = s.id and h.acao = 'Importada do sistema antigo');

insert into public.historico (solicitacao_id, acao, usuario_nome)
select s.id, 'Importada do sistema antigo', 'Sistema'
from public.solicitacoes s
where s.id_antigo is not null
  and not exists (select 1 from public.historico h where h.solicitacao_id = s.id and h.acao = 'Importada do sistema antigo');

commit;

-- Conferência: quem ficou de fora (sem login no Authentication)
-- select u.nome, u.email from public.legado_usuarios u
-- where not exists (select 1 from public.perfis p where lower(p.email) = lower(u.email::text));
