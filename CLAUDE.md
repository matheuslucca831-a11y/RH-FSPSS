# SIGER RH | FSPSS — guia para o Claude Code

Sistema de pedidos de RH da Fundação de Saúde Pública de São Sebastião (FSPSS): ocorrência de ponto,
folga, férias, cancelamento, saída antecipada, estágio e transferência de lotação. O funcionário pede,
as chefias assinam eletronicamente (com senha), a Direção decide quando preciso e o RH dá baixa.

- Responsável: Matheus Lucca (Aux. Administrativo, Atenção Básica). Fale e escreva **em português do Brasil**.
- Usuários finais: muitos são leigos e usam **celular** (gerentes e supervisores principalmente). Textos curtos e simples.
- Produção: https://siger-rh-fspss.vercel.app (Vercel, publica sozinho a cada push na `main`).
- Banco: Supabase, projeto **RH FSPSS1** (`uaknekhujyhktntaysbx`, sa-east-1).
- Repositório: `matheuslucca831-a11y/RH-FSPSS`.
- O `README.md` está desatualizado na parte de fluxo (ainda fala só de chefia → Direção). Vale o que está aqui e no SQL.

## Stack

- Next.js **15.4** com `output: 'export'` (site 100% estático, sem servidor), React 19, TypeScript, Tailwind CSS **v4**, lucide-react, qrcode.
- `@supabase/ssr` no navegador (`src/lib/supabase/client.ts`). **Toda regra de acesso fica no banco** (RLS + funções `security definer`).
- Edge Functions (Deno) em `supabase/functions/`: `rh-usuarios` (criar/alterar acessos, só Direção) e `rh-comprovante` (link temporário do anexo). Publicadas com `verify_jwt: false` porque validam o token por conta própria.

## Comandos

```bash
npm install
npm run dev            # precisa de .env.local com NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run build          # next build + scripts/pos-build.mjs (gera a CSP com hash por página)
npx tsc --noEmit       # checagem de tipos (rodar sempre antes de commit)
```

Build local sem o Supabase real: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=teste npm run build`.
O `pos-build.mjs` falha se a URL não for válida, e a CSP gerada só libera essa URL (não publique um build feito com URL de teste).

## Estrutura

```
src/app/(sistema)/<tela>/page.tsx + PaginaCliente.tsx   telas logadas; PaginaCliente usa <Exige papeis={...}>
src/app/login, comprovante, verificar                    públicas (verificar = conferir documento assinado pelo código)
src/components/telas/*        uma tela por arquivo (Inicio, ParaAssinar, BaixaRH, Relatorios, TodasSolicitacoes…)
src/components/admin/*        Administração: Usuários, Fluxos de assinatura, Unidades, Segurança, Auditoria
src/components/solicitacoes/  CartaoSolicitacao, Lista, Acoes (assinar/negar/cancelar)
src/components/assinatura/    CampoAssinatura (senha → token de uso único), Comprovante
src/components/Escolha.tsx    campo de escolha com busca (substitui <select>)
src/components/Janela.tsx     modal (portal no body, fecha no Esc/fora)
src/components/ui.tsx         Botao, Campo, Aviso, Selo, Cabecalho, Segmentos, Abas, CampoBusca, TabelaWrap…
src/lib/solicitacoes.ts       tipos do pedido, CATEGORIAS, fluxo (Etapa, VagaFluxo, Rotas), linhaDoTempo, frase
src/lib/types.ts              Papel, PAPEIS, ASSINAM, SEM_UNIDADE
src/lib/rotas.ts              menu e quem vê cada tela (soComFila: item aparece só se houver fila)
src/lib/contextoPerfil.tsx    sessão, perfil (rpc minha_seguranca), MFA, inatividade, <Exige>
src/lib/cacheTela.ts          useConsulta (cache em memória por tela)
supabase/0NN_*.sql            migrações, numeradas e em ordem
```

## Regras de interface (obrigatórias)

1. **Nunca usar `<select>` nativo.** Use `Escolha` (o usuário digita e as opções aparecem embaixo).
   `vazio="Todas"` para opção vazia, `livre` para aceitar texto digitado, `compacto` em filtros.
2. **Celular primeiro**: testar em 390px de largura. Alvos de toque ≥ 40px, barras de ação fixas no rodapé
   (`bottom-[calc(4rem+env(safe-area-inset-bottom))]` acima do menu inferior; `lg:left-72` no computador),
   nada de rolagem lateral (`min-w-0` em flex/grid).
3. Formulários grandes em `Janela` (modal), não soltos no meio da lista.
4. Cores pelos tokens do `globals.css` (`electric-cobalt`, `ink-charcoal`, `slate-gray`, `linha`, `lavender-mist`,
   `danger`, `warning`, `forest`…). Cartões com `dock-card`.
5. Textos para leigos: sem jargão ("assinar", "pedido", "etapa"); erros do banco em português (`mensagemErro`).
6. Seleção em lote: caixa de seleção nos cartões + "Marcar os N filtrados" + barra fixa com a ação.

## Papéis (`perfis.papel`)

`funcionario`, `enfermeiro` (Enfermeiro responsável), `gerente`, `supervisor`, `coordenacao` (Coordenação de Enfermagem),
`diretor` (Diretor de área: assina, não administra), `rh` (vê tudo e dá baixa), `direcao` (administra tudo e pode decidir direto).
Chefias podem atuar em várias unidades: tabela `supervisao` + função `atua_em(perfil, unidade)`.

## Fluxos de assinatura (o coração do sistema)

Configuráveis em Administração › Fluxos de assinatura (tabela `fluxos`, coluna `rotas jsonb`). Cada pessoa tem `perfis.fluxo_id`.

```jsonc
{ "padrao": [Etapa, ...],          // usado pelos tipos sem caminho próprio
  "folga":  [Etapa, ...], ... }    // ponto, folga, ferias, cancelamento, saida, estagio, transferencia
Etapa = { "nome": "Chefia da unidade", "regra": "todos" | "um",
          "vagas": [Vaga, ...], "substituto": Vaga | null, "gozo_imediato": bool }
Vaga  = { "tipo": "unidade" | "papel" | "cargo" | "pessoa", "valor": "..." }
//  unidade: enfermeiro|gerente|supervisor da unidade de quem pede
//  papel:   qualquer pessoa com o papel (direcao, coordenacao, rh, diretor…)
//  cargo:   texto do cargo no cadastro (sem diferenciar maiúsculas)
//  pessoa:  id do perfil
```

- No envio, `tg_solicitacao_insert` **copia** a rota (com rótulos) para `solicitacoes.rota`, com `etapa_atual`, `pendentes`
  (índices das vagas, em texto) e `situacao = 'Aguardando assinatura'`. Sem fluxo = só a Direção.
- `assinar(p_id, p_aprovar, p_obs, p_no_lugar_de, p_motivo_ausencia, p_outra_ciente, p_token)`, nesta ordem de checagem:
  titular de vaga pendente → substituto (só com o titular ausente: ausência registrada ou motivo Férias/Afastamento médico)
  → Direção decidindo direto (motivo obrigatório). `p_outra_ciente = true` faz o pedido **seguir só com esta assinatura**:
  folga de gozo imediato (outra chefia ausente e ciente) ou qualquer pedido com justificativa em `p_obs`.
- Ninguém assina o próprio pedido. Negar exige motivo.
- `fila_assinaturas()` devolve `(id, como 'titular'|'substituto'|'direcao_direta', vagas, rotulos, ausentes, precisa_motivo)`.
- Mudou o fluxo da pessoa, editou ou desativou o fluxo → triggers chamam `recalcular_pedido`: pendentes seguem o fluxo novo,
  assinaturas já feitas continuam valendo (011).
- Fim: aprovado → RH dá baixa em lote (`dar_baixa(uuid[])`, `desfazer_baixa`), tela `/baixa`.
- Modelos prontos da Circular 254/2026 (Atenção Básica): Cargos gerais (Enfermeiro + Gerente, Supervisor na ausência),
  Farmácia (basta uma chefia), Enfermeiros (Gerente), Gerentes (Coordenação), Gestão (Direção decide).
  Folga/férias/cancelamento terminam na Direção; saída e estágio só o Enfermeiro (Gerente na ausência).

## Assinatura eletrônica (007)

Sem rubrica desenhada, **só senha**. `confirmar_senha(senha)` devolve um token de uso único (5 erros em 15 min bloqueiam),
consumido por `assinar`/envio. Cada assinatura guarda hash SHA-256 do documento, IP, aparelho e hash encadeado.
Pedido e assinatura assinados não podem ser alterados (triggers). `verificar_documento(codigo)` é público (anon).

## Banco: como mexer

- **Sempre** uma migração nova `supabase/0NN_nome.sql` (próxima: **012**), idempotente (`create or replace`, `if not exists`,
  `drop ... if exists`), com cabeçalho explicando o que faz e "Rodar depois do 0NN".
- Funções novas: `security definer set search_path = public`; no fim, `revoke execute ... from public, anon` e
  `grant execute ... to authenticated` só no que a tela chama. Função usada em política RLS precisa de grant para `authenticated`.
- Mudou o tipo de retorno de função → `drop function` antes de recriar.
- Aplicar em produção pelo MCP do Supabase (`apply_migration`); ele pode pedir confirmação ao Matheus.
  Se a confirmação não vier, não insistir no mesmo turno: avisar e esperar.
- Testar antes num Postgres local com `mock_supabase` (schema `auth`, `auth.uid()` via `request.jwt.claims`) quando possível.
- Não expor a chave service_role no site. Só as Edge Functions a usam.

## Testes

Não há suíte automatizada. Antes de publicar: `npx tsc --noEmit`, `npm run build` e conferir as telas mexidas no
Playwright (já instalado em ambientes do Claude), em **celular (iPhone 13) e computador (1440px)**, tirando print.
Um jeito que funciona: PostgREST local (binário do GitHub) sobre o Postgres de teste + `page.route` interceptando
`/auth/v1/*` (token JWT HS256 assinado localmente, com `aal: 'aal2'`) e repassando `/rest/v1/*` para o PostgREST.

## Publicação

1. `npx tsc --noEmit` e `npm run build` sem erro.
2. Migração aplicada no Supabase **antes** de publicar o site, se a tela depende dela
   (senão, use uma branch: o Vercel gera só a prévia).
3. Commit em português, explicando o porquê; push na `main` → Vercel publica.
4. Edge Function alterada → republicar pelo MCP com `verify_jwt: false`.

## Skills do projeto

Em `.claude/skills/`, trazidas do ECC (MIT) com uma nota "Neste projeto" no topo de cada uma:
`postgres-patterns`, `security-review`, `react-patterns`, `react-performance`, `frontend-a11y`, `e2e-testing`,
`typescript-patterns`. Em conflito, vale este arquivo.

## Cuidado

- Não reverter decisões já tomadas com o Matheus: assinatura **só com senha** (sem desenho), selects trocados por `Escolha`,
  fluxos configuráveis em vez de regras fixas, opção "seguir só com a minha assinatura" disponível em todos os fluxos.
- Dados de funcionários são pessoais: não colar dados reais em issues, commits ou prints públicos.
- Segurança já configurada no painel do Supabase (nov/2026): Site URL = `https://siger-rh-fspss.vercel.app`;
  secret `ALLOWED_ORIGINS` = os dois domínios do Vercel (`siger-rh-fspss` e `siger-rh`), por isso Administração de
  usuários e comprovantes **não funcionam nas prévias** do Vercel ("Origem não autorizada"); cadastro público desligado;
  senha mínima de 8 com letras e números, e troca de senha exige login recente.
- Pendência conhecida: README desatualizado.
