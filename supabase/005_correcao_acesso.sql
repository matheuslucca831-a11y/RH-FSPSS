-- =====================================================================
-- SIGER RH | FSPSS
-- 005_correcao_acesso.sql: rode UMA VEZ se você já tinha rodado o 001 antes de 23/10/2026 12h.
-- Corrige o vai e volta entre /inicio e /login: a checagem de acesso e o perfil
-- passam a vir de uma única resposta do banco. Pode rodar mais de uma vez.
-- =====================================================================

-- 1) Se o 000 foi rodado depois do 001, ele renomeou a tabela nova "unidades" para "legado_unidades".
--    Aqui ela volta ao nome certo (com dados, regras de acesso e ligações intactos).
do $$
begin
  if to_regclass('public.unidades') is null and to_regclass('public.legado_unidades') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'legado_unidades' and column_name = 'ativa') then
    alter table public.legado_unidades rename to unidades;
    raise notice 'Tabela unidades restaurada.';
  end if;
  if to_regclass('public.unidades') is null then
    raise exception 'A tabela unidades não existe. Rode o 001_estrutura.sql antes deste script.';
  end if;
end $$;

-- 2) Checagem de acesso e perfil em uma única resposta
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

revoke execute on function public.minha_seguranca() from public, anon;
grant execute on function public.minha_seguranca() to authenticated;

-- Garante a linha de configuração (se tiver sido apagada por engano)
insert into public.seguranca_config default values on conflict (id) do nothing;
