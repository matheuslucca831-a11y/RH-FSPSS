-- =====================================================================
-- SIGER RH | FSPSS
-- 004_verificar_seguranca.sql: rode depois dos outros para CONFERIR.
-- Não altera nada. Cada linha que aparecer com "PROBLEMA" precisa de atenção.
-- =====================================================================

-- 1) Tabelas do schema public sem RLS ligado
select 'PROBLEMA: tabela sem RLS' as resultado, c.relname as item
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

union all
-- 2) Qualquer privilégio de tabela para quem não fez login
select 'PROBLEMA: anon tem acesso à tabela', table_name || ' (' || string_agg(privilege_type, ', ') || ')'
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name

union all
-- 3) Funções do schema public que quem não fez login consegue executar
select 'PROBLEMA: anon executa a função', p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')

union all
-- 4) Buckets públicos (atestados nunca devem ficar públicos)
select 'PROBLEMA: bucket público', id from storage.buckets where public

union all
-- 5) Funções security definer sem search_path fixo
select 'PROBLEMA: função sem search_path', p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')

union all
-- 6) Verificação em duas etapas desligada para a Direção
select 'ATENÇÃO: verificação em duas etapas da Direção desligada', 'seguranca_config'
from public.seguranca_config where not exigir_mfa_direcao

union all
-- 7) Direção sem verificação em duas etapas cadastrada (vai ser obrigada a cadastrar no próximo acesso)
select 'AVISO: Direção ainda sem app autenticador', p.nome
from public.perfis p
where p.papel = 'direcao' and p.ativo
  and not exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')

union all
select 'OK: verificação concluída', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
