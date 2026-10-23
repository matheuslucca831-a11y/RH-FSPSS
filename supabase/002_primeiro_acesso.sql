-- =====================================================================
-- SIGER RH | FSPSS
-- 002_primeiro_acesso.sql: cria o PRIMEIRO acesso (Direção)
-- Os outros acessos você cria pelo próprio site: Administração > Usuários.
--
-- PASSO 1 (no painel do Supabase):
--   Authentication > Users > Add user > Create new user
--     Email:    SUA_MATRICULA@rh12.com      (ex.: 12345@rh12.com)
--     Password: a sua senha (mínimo 8 caracteres, com letras e números)
--     Marque "Auto Confirm User" e clique em Create user
--
-- PASSO 2: troque os 3 valores logo abaixo e rode este script inteiro.
--
-- PASSO 3: no site, entre só com a matrícula (ex.: 12345) e a senha.
--   Como é Direção, o site pede para cadastrar a verificação em duas etapas:
--   tenha no celular um app autenticador (Google Authenticator, Microsoft Authenticator...).
-- =====================================================================

do $$
declare
  -- >>>>>>>>>>>>>>>>>>>> TROQUE AQUI <<<<<<<<<<<<<<<<<<<<
  v_matricula text := '12345';               -- a mesma do e-mail criado no PASSO 1
  v_nome      text := 'SEU NOME COMPLETO';
  v_cargo     text := 'Gestor(a)';
  -- >>>>>>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<<<
  v_email text := lower(v_matricula) || '@rh12.com';
  v_id uuid;
begin
  if to_regclass('public.perfis') is null then
    raise exception 'Rode antes os scripts 000 e 001.';
  end if;
  select id into v_id from auth.users where lower(email) = v_email;
  if v_id is null then
    raise exception 'Não achei o login %. Crie primeiro em Authentication > Users > Add user (PASSO 1).', v_email;
  end if;

  insert into public.perfis (id, nome, matricula, email, cargo, papel, deve_trocar_senha, ativo)
  values (v_id, v_nome, v_matricula, v_email, v_cargo, 'direcao', false, true)
  on conflict (id) do update set nome = excluded.nome, papel = 'direcao', unidade_id = null, ativo = true;

  raise notice 'Pronto! Entre no site com a matrícula % e a senha que você criou.', v_matricula;
end $$;

-- Opcional: já cadastrar as unidades (ou faça pelo site, em Administração > Unidades)
-- insert into public.unidades (nome, sigla) values ('USF Boiçucanga', 'BOI'), ('USF Maresias', 'MAR');
