# SIGER RH | FSPSS

Ajustes de ponto e folgas, do pedido do funcionário até a decisão final.
Next.js 15.4 (site estático) + Supabase, no mesmo padrão visual e de hospedagem do SIGER DAE.

## Como funciona

| Acesso | O que faz |
|---|---|
| **Funcionário** | Pede ajuste de ponto ou folga (com comprovante) e acompanha em *Minhas solicitações*. Pode cancelar enquanto está em análise. |
| **Chefia da unidade** (enfermeiro/supervisor) | Analisa os pedidos da equipe da unidade em *Aprovações*. Também faz os próprios pedidos. |
| **Direção** | Decisão final das folgas, *Todas as solicitações*, *Arquivo*, *Relatórios* e *Administração* (usuários, unidades, segurança e auditoria). |

- **Ajuste de ponto:** Funcionário > Chefia > concluído
- **Folga:** Funcionário > Chefia > Direção > concluído
- Pedido da chefia (ou da Direção) vai direto para a Direção: ninguém analisa o próprio pedido.
- Negar sempre exige o motivo, que aparece para quem pediu.
- Atestado e Serviço eleitoral (TRE) exigem comprovante.

## Segurança

Todas as regras ficam **no banco**, não só na tela. Mesmo que alguém abra o código do site ou chame a API direto, o Supabase recusa.

| Camada | O que está protegido |
|---|---|
| **Banco (RLS)** | Cada um vê só o que pode: funcionário vê os próprios pedidos, chefia vê a unidade, Direção vê tudo. Quem não fez login não tem nenhum acesso. Mudanças de situação só pelas funções do fluxo, que conferem quem pode fazer o quê. Colunas liberadas uma a uma. |
| **Primeiro acesso** | A senha inicial é temporária. Até criar a senha pessoal, a pessoa não vê nenhum dado (regra do banco). |
| **Duas etapas** | A Direção só acessa com o código do app autenticador do celular (aal2). Pode ser exigido também da chefia em *Administração > Segurança*. |
| **Senhas** | Mínimo de 8 caracteres, com letras e números, sem a matrícula e fora das senhas mais comuns. Freio no navegador depois de 5 tentativas erradas. |
| **Sessão** | Sai sozinha depois de 30 minutos sem uso (configurável). *Minha conta* tem "Sair de todos os aparelhos". |
| **Desativar acesso** | Bloqueia o login no Supabase e derruba na hora as sessões abertas da pessoa. |
| **Comprovantes** | Bucket **privado**. O arquivo só abre pela Edge Function `rh-comprovante`, que confere a permissão, gera um link de 60 segundos e registra quem abriu. No envio, o site confere o conteúdo do arquivo (PDF, JPG ou PNG de verdade, até 10 MB). |
| **Auditoria** | Entradas, trocas de senha, acessos criados/alterados/desativados, comprovantes abertos, exclusões e mudanças de configuração. Somente leitura: nem a Direção consegue apagar. |
| **Envio em massa** | Limite de pedidos por pessoa em 24 horas (configurável). |
| **Site** | Política de Segurança de Conteúdo (CSP) com o hash de cada script de cada página (script injetado não roda), HTTPS obrigatório, proteção contra uso dentro de outro site (clickjacking), arquivos de configuração bloqueados e CSV exportado sem risco de fórmula maliciosa. |
| **Chave secreta** | Nunca vai para o site. Fica só nas Edge Functions. |

## Implantação

### 0. Antes de tudo: troque as chaves do Supabase do RH

O `APP.py` antigo tinha a chave **service_role** escrita no código, e o código estava no GitHub.
Com ela, qualquer pessoa lê e apaga tudo no banco.

Supabase > **Project Settings > API Keys**: gere chaves novas e desative as antigas (ou faça "Roll" na JWT secret).

### 1. Banco (Supabase > SQL Editor), nesta ordem

| Script | O que faz |
|---|---|
| `supabase/000_guardar_sistema_antigo.sql` | Renomeia as tabelas antigas para `legado_*` (não apaga nada), fecha o acesso a elas e torna **privado** o bucket `anexos`, que hoje deixa os atestados abertos para quem tiver o link. |
| `supabase/001_estrutura.sql` | Cria tudo: tabelas, regras de acesso, funções do fluxo, auditoria, configuração de segurança e o bucket privado `comprovantes`. |
| `supabase/003_importar_sistema_antigo.sql` | *(Opcional)* Traz unidades, usuários (que já têm login) e ocorrências do sistema antigo. Todos vão precisar criar senha nova no primeiro acesso. |
| `supabase/002_primeiro_acesso.sql` | Cria o primeiro acesso de Direção (instruções no arquivo). |
| `supabase/004_verificar_seguranca.sql` | Confere a instalação. Qualquer linha "PROBLEMA" precisa de atenção. |
| `supabase/005_correcao_acesso.sql` | Correção do acesso (perfil na checagem de segurança). |
| `supabase/006_fluxo_circular_254.sql` | **Fluxo de assinaturas da Circular nº 254/2026** (papéis, ausências, assinaturas). Rodar depois do 005. |
| `supabase/007_assinatura_eletronica.sql` | **Assinatura eletrônica com confirmação de senha**, código do documento (SHA-256), QR code e verificação pública. Rodar depois do 006. |

### 2. Configurações do Supabase (painel)

Estas só podem ser ligadas pelo painel:

- [ ] **Authentication > Sign In / Providers > Email**: desligue **"Allow new users to sign up"** (só a Direção cria acessos).
- [ ] **Authentication > Sign In / Providers**: deixe **"Allow anonymous sign-ins"** desligado.
- [ ] **Authentication > Multi-Factor**: **TOTP** ligado (vem ligado por padrão).
- [ ] **Authentication > Policies > Password**: mínimo **8** caracteres e exigir **letras e números**. Se o plano permitir, ligue **"Prevent use of leaked passwords"**.
- [ ] **Authentication > Rate Limits**: mantenha os limites de login padrão (ou mais baixos).
- [ ] **Authentication > URL Configuration**: *Site URL* com o endereço do site (ex.: `https://rh.seudominio.com.br`).
- [ ] **Authentication > Sessions** (planos pagos): tempo máximo de sessão e "Single session per user", se quiser.
- [ ] **Database > Backups**: confira os backups automáticos.

### 3. Edge Functions

Publique as duas (Edge Functions > Deploy new function > cole o código), cada uma com o nome exato:

- `supabase/functions/rh-usuarios/index.ts` com o nome **`rh-usuarios`**
- `supabase/functions/rh-comprovante/index.ts` com o nome **`rh-comprovante`**

Em cada uma, em **Details**, desligue **"Verify JWT"** e salve (as funções conferem o login sozinhas, com regras mais rígidas).

Em **Edge Functions > Secrets**, crie `ALLOWED_ORIGINS` com o endereço do site (ex.: `https://rh.seudominio.com.br`).
Assim as funções só aceitam chamadas vindas do SIGER RH.

### 4. Variáveis (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-ou-publishable
NEXT_PUBLIC_DOMINIO_LOGIN=rh12.com
NEXT_PUBLIC_SITE_URL=https://rh.seudominio.com.br
```

O login é pela **matrícula**. Por trás, o Supabase usa `matrícula@rh12.com`, o mesmo padrão do sistema antigo.

### 5. Gerar e publicar (HostGator, igual ao SIGER DAE)

```
npm install
npm run build:hostgator
```

Isso gera `SIGER-RH-HostGator.zip` com o site pronto, já com a CSP em cada página e o `.htaccess` de segurança.
No cPanel, crie o **subdomínio** (ex.: `rh.seudominio.com.br`), envie o zip para a pasta dele e extraia. Ative o **SSL** do subdomínio (AutoSSL).

> O site precisa ficar na raiz de um subdomínio (não em `dominio.com/pasta`).

Para testar no computador: `npm run dev` e abra `http://localhost:3000`.

### Celular perdido / esqueceu a senha

- **Esqueceu a senha:** *Administração > Usuários > Senha* gera uma senha temporária; a pessoa cria a dela no próximo acesso.
- **Perdeu o celular (duas etapas):** outra pessoa da Direção usa *Novo celular* no cartão do usuário.
- **Única pessoa da Direção perdeu o celular:** no SQL Editor, `delete from auth.mfa_factors where user_id = (select id from public.perfis where matricula = 'MATRÍCULA');`

> Tenha pelo menos **duas pessoas na Direção**: ninguém decide o próprio pedido nem libera o próprio celular.

## Estrutura

```
src/app/login                 Entrada: matrícula e senha, duas etapas, troca da senha inicial
src/app/(sistema)/…           Telas (só abrem depois de todas as etapas de acesso)
src/lib/contextoPerfil.tsx    Proteção das telas, saída por inatividade
src/lib/acesso.ts             Etapas de acesso, regras de senha, freio de tentativas
src/components/telas          Início, Minhas solicitações, Aprovações, Decisão, Todas, Relatórios, Minha conta
src/components/admin          Usuários, unidades, segurança e auditoria
src/components/solicitacoes   Cartão com linha do tempo e ações
scripts/pos-build.mjs         CSP com hashes + .htaccess no build
scripts/pacote-hostgator.mjs  Gera o .zip para a HostGator
hospedagem/.htaccess          HTTPS, cabeçalhos de segurança, URLs limpas
supabase/                     Scripts SQL e Edge Functions
```


## Fluxo de assinaturas (Circular nº 254/2026)

| Quem pede | O que pede | Quem assina | Na ausência (férias ou afastamento médico) |
|---|---|---|---|
| Cargos gerais | Férias, folgas, ocorrências de ponto, cancelamentos | Enfermeiro responsável + Gerente | Supervisor assina no lugar |
| Farmacêutico e Técnico de Farmácia | Qualquer | Enfermeiro **ou** Gerente (basta um) | Supervisor, se os dois estiverem ausentes |
| Enfermeiro | Qualquer | Gerente | Supervisor |
| Gerente | Qualquer | Coordenação de Enfermagem | |
| Qualquer um | Saída antecipada e estágio | Enfermeiro (Gerente só na ausência dele) | Com os dois ausentes, aguarda o retorno |
| Qualquer um | Transferência de lotação | Coordenação / Direção | |

- Folgas, férias e cancelamentos seguem depois para a **decisão final da Direção**.
- **Folga para gozo imediato**: com Enfermeiro ou Gerente ausente, o outro assina sozinho, registrando que a outra chefia está ciente.
- **Ausências**: registradas em "Ausências das chefias" liberam o substituto na hora. Sem registro, o substituto assina declarando o motivo (fica no histórico). Férias de chefia aprovadas no sistema viram ausência automaticamente.
- Em Administração > Usuários, defina para cada pessoa o **Acesso** (Funcionário, Enfermeiro responsável, Gerente, Supervisor, Coordenação, Direção), **Quem assina os pedidos** (Cargos gerais, Farmácia, Enfermeiro, Gerente) e, para Supervisor, as **unidades que acompanha**.


## Assinatura eletrônica (Lei nº 14.063/2020)

- Para **enviar, aprovar ou negar** um pedido, a pessoa confirma a **senha de acesso**. A senha não é gravada: ela gera uma autorização de uso único, válida por 2 minutos. Depois de 5 senhas erradas em 15 minutos, a assinatura fica travada por 15 minutos.
- Cada assinatura registra a data e a hora do servidor, o aparelho, o endereço de rede e o **código do documento** (SHA-256 do conteúdo assinado). Pedidos e assinaturas não podem ser alterados depois.
- **Documento assinado** (botão no cartão do pedido): página pronta para imprimir ou salvar em PDF, com QR code.
- **Verificação pública**: `/verificar?c=CODIGO`, sem login. Mostra só o essencial (nome reduzido, matrícula mascarada, sem justificativa nem anexo) e diz se o documento continua íntegro.
- Recomendação: a FSPSS publicar uma portaria reconhecendo esta forma de assinatura nas solicitações de RH (art. 5º da Lei 14.063/2020).
