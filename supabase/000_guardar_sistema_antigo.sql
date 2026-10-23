-- =====================================================================
-- SIGER RH — FSPSS
-- 000_guardar_sistema_antigo.sql — rodar PRIMEIRO, uma vez só
--
-- O sistema antigo (Streamlit) criou as tabelas usuarios, ocorrencias,
-- vinculos, unidades e logs_atividades. Este script NÃO apaga nada:
-- só renomeia para legado_* (para liberar os nomes) e fecha o acesso
-- a elas pelo site. Se quiser trazer os dados, rode depois o 003.
--
-- Também fecha o bucket "anexos" do sistema antigo, que era PÚBLICO:
-- qualquer pessoa com o link conseguia abrir os atestados. Os arquivos
-- continuam lá e passam a abrir só pelo sistema novo, para quem tem permissão.
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['usuarios','ocorrencias','vinculos','unidades','logs_atividades'] loop
    -- Nunca renomeia a tabela "unidades" do SIGER RH (a nova tem a coluna "ativa"; a antiga não)
    if t = 'unidades' and exists (select 1 from information_schema.columns
                                  where table_schema = 'public' and table_name = 'unidades' and column_name = 'ativa') then
      continue;
    end if;
    if to_regclass('public.' || t) is not null and to_regclass('public.legado_' || t) is null then
      execute format('alter table public.%I rename to %I', t, 'legado_' || t);
    end if;
    if to_regclass('public.legado_' || t) is not null then
      -- RLS ligado e sem políticas = ninguém lê pelo site (só o SQL Editor)
      execute format('alter table public.%I enable row level security', 'legado_' || t);
    end if;
  end loop;
end $$;

-- Bucket antigo de comprovantes: deixa de ser público
update storage.buckets set public = false where id = 'anexos';
