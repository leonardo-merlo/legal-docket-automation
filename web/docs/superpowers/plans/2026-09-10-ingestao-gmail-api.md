# Ingestão da pauta da OAB via Gmail API — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** substituir a tarefa agendada do Claude Desktop (Cowork) do Rafael por uma ingestão no próprio painel. O painel lê a pauta da OAB no Gmail `gestor@exemplo-adv.example` a cada 15 min, guarda cada e-mail com o resultado do parser e (só em modo ativo) grava em `processos`.

**Arquitetura:** `pg_cron` + `pg_net` no Supabase fazem `POST /api/gmail/sincronizar` a cada 15 min com um Bearer guardado no Vault. A rota renova o access token a partir de um refresh token cifrado (AES-256-GCM) em `integracao_gmail`, lista as mensagens pela API REST do Gmail (`fetch`, sem SDK), extrai o `text/plain`, roda um parser puro e grava em `emails_recebidos`. Em modo `ativo`, aplica em `processos` pelas regras do Cowork. O OAuth é feito no próprio painel (botão "Conectar Gmail", só gestor).

**Stack:** Next.js 16 (App Router) · TypeScript strict · Supabase (Postgres, Vault, pg_cron, pg_net) · Vercel · `node:test` com type stripping (sem dependência nova).

---

## 0. Regras desta sessão (ler antes de tudo)

### Autonomia concedida pelo Leonardo em 10/09/2026

- **Pode, sem perguntar:**
  - aplicar as migrações escritas neste plano (Tarefas 1 e 17) pelo MCP do Supabase;
  - commitar direto na `main` do repo do painel;
  - fazer `git push` (push = deploy de produção no Vercel), **desde que** `npm test`, `npm run lint` e `npm run build` passem e a revisão da Tarefa 14 não tenha achado nada crítico em aberto.
- **Nunca, nem com autonomia:**
  - apagar dado (`DELETE`, `DROP TABLE`, `TRUNCATE`, `DROP COLUMN`) em tabela que já existia;
  - ligar o modo ativo (`GMAIL_INGESTAO_MODO=ativo`): a ingestão fica em **sombra** até o Leonardo mandar, e isso é outra sessão (ver seção final);
  - mexer em `/api/email/processar`, em `lib/email/processar.ts` (`processarEmailTexto`) ou no agente Python (`../controladoria-playwright`);
  - instalar dependência (npm ou pip);
  - usar Pub/Sub, Cloud Run, filas, Edge Functions ou o provedor Google do Supabase Auth;
  - pedir `gmail.modify`, marcar e-mail como lido ou etiquetar.
- **Pare e pergunte ao Leonardo** se: uma migração falhar de um jeito que peça SQL diferente do plano; o build quebrar por algo fora destes arquivos; o Google devolver erro de configuração (`redirect_uri_mismatch`, `access_denied` por app em teste); ou os números da validação real (Tarefa 16) não fecharem.

### Segredos e dados de cliente

- Nunca mostre no chat, em log ou em commit o valor de `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_ENCRYPTION_KEY`, `GMAIL_SYNC_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, nem tokens do Google. Para usar um segredo, rode um script que lê o `.env.local` e não imprime o valor.
- O `.env.local` do painel já tem as 4 variáveis do Gmail (gravadas em 10/09), e o Vercel também (Production + Preview).
- **Não commite e-mail real nem trecho dele** (nome, CPF, CNJ de cliente). A fixture real fica em `.fixtures-privadas/` (já está no `.gitignore`):
  - `.fixtures-privadas/pauta-15-06-26.txt`: o `text/plain` do e-mail de exemplo, já decodificado de windows-1252 para UTF-8;
  - `.fixtures-privadas/pauta-15-06-26.esperado.json`: números conferidos à mão (52 blocos, 20 FINT, 32 válidos, 29 CNJs únicos, 3 repetidos, 2 CNJs de 2ª instância, 1 polo passivo quebrado em duas linhas).
- Nos testes versionados, use só dado inventado (CNJs com ano 2099, nomes como "FULANO DE TAL").
- Ao relatar a validação real para o Leonardo, fale só em contagens e datas de pauta, nunca nomes de partes.

### Comunicação com o Leonardo

- Ele **não roda comando**. Não passe passo a passo técnico. Quem sobe script, roda SQL e faz deploy é você; ele só clica no painel, no Google e no Vercel.
- Responda simples e prático. Ao final, entregue um resumo curto: o que ficou pronto, o que foi verificado e como, o que depende dele, o que ficou para depois.
- Pendência adiada vai para `docs/divida-tecnica.md` (acrescente no fim, nunca reescreva o que já existe). Não deixe pendência só na conversa.

### Next.js 16

Este repo usa Next 16.2.7, e a API mudou em relação ao que você conhece. Antes de escrever rota, página ou server action, leia o guia em `node_modules/next/dist/docs/` (por exemplo `01-app/03-api-reference/04-functions/cookies.md` e `01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`). O `middleware.ts` está depreciado em favor de `proxy.ts`, mas **não renomeie**: só edite a lista de rotas públicas.

---

## 1. Contexto já levantado (não precisa re-investigar)

- **Repo do painel:** `C:\Users\User\Projects\exemplo-adv-advogados\exemplo-adv-controladoria` (remote `leonardo-merlo/ia-controladoria-advocacia`, branch `main`).
- **Vercel:** time `team_OyYVusZ76w1OTIAJEn8Y98lD`, projeto `prj_oOcwzZSN13rokYXAG6heNnAfM9Ro` (`ia-controladoria-app`). Domínio de produção: `https://ia-controladoria-app.vercel.app`.
- **Supabase:** projeto `YOUR_PROJECT_REF`.
  - `pg_cron` e `pg_net` estão disponíveis mas **não instalados**; `supabase_vault` e `pgcrypto` já estão.
  - As migrações vivem só no banco (aplicadas pelo MCP); não existe pasta `supabase/migrations` no repo.
- **Google Cloud:** projeto `controladoria-exemplo-adv`, app **Em produção** e não verificado (quem conecta vê "O Google não verificou este app"). Scope único `gmail.readonly`.
  - Redirect URIs cadastrados: `https://ia-controladoria-app.vercel.app/api/gmail/callback`, `https://ia-controladoria-app-leomamerlo-7322s-projects.vercel.app/api/gmail/callback`, `https://ia-controladoria-app-git-main-leomamerlo-7322s-projects.vercel.app/api/gmail/callback` e `http://localhost:3000/api/gmail/callback`.
  - A política de privacidade cadastrada é `https://ia-controladoria-app.vercel.app/privacidade`, e a página ainda não existe (Tarefa 11).
  - O valor de `NEXT_PUBLIC_SITE_URL` em produção está marcado como sensível e ninguém viu. Se o callback der `redirect_uri_mismatch`, a tela de erro do Google mostra o endereço enviado: peça ao Leonardo para acrescentá-lo em Clients.
- **Middleware:** todo caminho fora de `ROTAS_PUBLICAS` sem sessão é redirecionado para `/login`. A chamada do `pg_cron` não tem sessão, então `/api/gmail/sincronizar` **precisa** entrar na lista (a rota se protege com o Bearer). `/privacidade` também.
- **`emails_recebidos`:**
  - colunas `id, remetente (NOT NULL), assunto, data_recebimento (NOT NULL), data_processamento, total_cnj`;
  - está **vazia**; RLS ligada e sem policies;
  - é lida em `app/emails/[id]/page.tsx` (e-mail + processos por `email_id`) e `app/processos/[id]/page.tsx` (join `email:emails_recebidos(...)`);
  - `app/dashboard/EmailLoteList.tsx` existe, mas nenhuma página o usa;
  - `app/dashboard/metricas.ts` não usa essa tabela: agrupa por `processos.lote_id`/`data_entrada`.
- **`processos`** (239 linhas):
  - `numero_cnj` é UNIQUE;
  - `pje_status` aceita `pendente, processado, ignorado, erro_browser, captcha_bloqueado, tratado_manual`;
  - `email_id` é FK para `emails_recebidos`, mas hoje está sempre nulo;
  - `lote_id` sempre vem em `DD/MM/AAAA`; `numero_publicacao` é texto;
  - `fonte` = `gmail` nas 239 linhas (é o que o Cowork grava);
  - linha nova do Cowork fica com `status_atual` nulo, e a reinserção dele não mexe em `data_entrada`.
- **Quem filtra por `fonte`:** ninguém (painel, agente e funções SQL conferidos). Valor escolhido para a ingestão nova: **`gmail_api`**. Assim a comparação com o Cowork (`gmail`) sai por um `WHERE`.
- **Sistema:**
  - o agente aceita os rótulos do Cowork e traduz sozinho (`pje_2g → pje_tjmg_2inst`, `pje → pje_tjmg`), então grave `pje`, `pje_2g`, `eproc_tjmg` e `eproc_trf6`;
  - o agente só pega `pje_status IN (pendente, erro_browser, captcha_bloqueado) AND duplicata = false`, então **nunca grave `duplicata = true`**.
- **Aviso de tratado na mão:** o formato está em `runner.py` (`aviso_publicacao_ignorada`, testado em `test_runner.py`):
  - uma linha `Publicação nova em DD/MM/AAAA — processo tratado na mão, não voltou para a fila.`;
  - mais recente primeiro, a mesma pauta não entra duas vezes, no máximo 10 linhas;
  - a Tarefa 6 porta essa função.
- **Pautas faltando no banco:** 20–21/08, 01–04/09, 09/09 e 10/09. O maior `lote_id` gravado pelo Cowork é `08/09/2026`.
- **Formato real do e-mail** (conferido na fixture):
  - blocos separados por `Publicação: N.`; linha `Tribunal:` (`FINT` = descartar); linha `Vara:`; às vezes `Cidade:`;
  - `PROCESSO: <CNJ> - <CLASSE> - || texto |||`; `CLASSE:`; `POLO ATIVO:` (pode repetir) e `POLO PASSIVO:`, e o valor pode continuar na linha de baixo ("BANCO C6" / "CONSIGNADO S.A.");
  - 2ª instância TJMG vem com vara "TJMG - 10ª CÂMARA CÍVEL" ou "Cartório da 10ª Câmara Cível – Pça Milton Campos", às vezes sem linha `PROCESSO:` (formato "02171 - <CNJ> @ (Processo Eletronico) Cidade;");
  - no fim do corpo, `Total de Publicações: N`. Antes do 1º bloco há o cabeçalho do encaminhamento ("ENC:"), que deve ser ignorado.

## 2. Decisões tomadas com o Leonardo (não re-discutir)

1. **Juizado = 1ª instância.** Se a linha `Vara:` tem "vara" **ou** "juizado", o sistema sai pelo 1º dígito do CNJ: 1 → `eproc_tjmg`, 5 → `pje`, 6 → `eproc_trf6`, outro → `null` com aviso. Sem nenhuma das duas palavras, vira `pje_2g`. Sem linha `Vara:`, o sistema sai pelo dígito, com aviso.
2. **CNJ que já existe:**
   - volta para `pendente` (publicação nova = análise nova), com `duplicata = false`;
   - se estiver `tratado_manual`, **não muda o status** e só ganha o aviso em `observacoes`;
   - `motivo_ignorado` e `data_ultima_consulta` não são tocados, e `data_entrada` só é preenchida em linha nova (default do banco);
   - campo de cabeçalho vazio na publicação não apaga o valor do banco.
3. **Autonomia total dentro do plano** (seção 0).
4. **Pautas faltando:**
   - a **1ª sincronização** olha 30 dias (depois, 7);
   - na ativação (outra sessão), a lista de CNJs das pautas de 20–21/08 e 01–04/09 é mostrada ao Leonardo e só é aplicada depois do ok dele.

**Desvios deliberados em relação ao Cowork** (a comparação em sombra vai mostrar diferença nestes campos, e isso é esperado):

- **Polo passivo** emenda a linha de continuação (Cowork: só a 1ª linha).
- **Comarca sem "da Comarca de"** vem da linha `Cidade:`, ou `null`. O Cowork usava "a última palavra que pareça município" e gravou "Campos" para "Pça Milton Campos".
- **CNJ repetido na pauta:** o último bloco define os campos, mas campo vazio nele herda o valor do bloco anterior (Cowork: o último bloco inteiro).
- **Polo passivo ausente:** fica `null`. A regra "tirar da linha PROCESSO:" não tem de onde tirar nos formatos reais, e o banco mostra o Cowork com `polo_passivo` nulo nesses casos também.

## 3. Mapa de arquivos

**Módulos puros** (testados com `node:test`). Entre eles, importe com extensão `.ts` e use `import type` para tipos, porque o Node roda com type stripping. Não use `enum` nem parameter properties.

| Arquivo | Responsabilidade |
|---|---|
| `lib/gmail/cripto.ts` | cifrar/decifrar o refresh token (AES-256-GCM) |
| `lib/gmail/seguranca.ts` | comparação em tempo constante, validação do Bearer, nome do cookie de `state` |
| `lib/gmail/mime.ts` | ler header e extrair o `text/plain` da árvore MIME do Gmail (base64url + charset) |
| `lib/gmail/parser.ts` | `parsearPauta(assunto, corpo)` → `ResultadoParser` |
| `lib/gmail/gravacao.ts` | decidir o que gravar em `processos`, aviso de tratado na mão, corte de ativação por data |
| `lib/gmail/config.ts` | ler o modo/remetentes do env, montar a busca do Gmail, conferir o From |
| `lib/gmail/alertas.ts` | saúde da sincronização e alertas por e-mail (para o painel) |

**Servidor** (sem teste unitário; validados pela integração real):

| Arquivo | Responsabilidade |
|---|---|
| `lib/gmail/google.ts` | OAuth (URL, troca de código, refresh) e API REST do Gmail via `fetch` |
| `lib/gmail/integracao.ts` | salvar a conexão (`integracao_gmail`) com o token cifrado |
| `lib/gmail/sincronizar.ts` | orquestra uma rodada: token → lista → mensagens → parser → banco |
| `lib/gmail/painel.ts` | carrega os dados dos indicadores (sem token) |
| `app/api/gmail/conectar/route.ts` | gera `state`, grava o cookie, redireciona ao Google |
| `app/api/gmail/callback/route.ts` | confere `state`, troca o código, salva a conexão |
| `app/api/gmail/sincronizar/route.ts` | `POST` com Bearer: roda `sincronizarGmail` |
| `app/privacidade/page.tsx` | política de privacidade pública |
| `components/gmail/indicadores-gmail.tsx` | cartão de status/alertas (dashboard e configurações) |
| `app/configuracoes/ConexaoGmail.tsx` | seção de configurações: botões e mensagem de retorno do OAuth |
| `app/configuracoes/SincronizarGmailButton.tsx` | botão "Sincronizar agora" (client) |
| `app/emails/[id]/LeituraDoEmail.tsx` | resultado do parser na página do e-mail |

**Arquivos modificados:**
- `middleware.ts` (rotas públicas)
- `tsconfig.json` (`allowImportingTsExtensions`)
- `package.json` (script `test`)
- `.env.example`
- `lib/supabase/types.ts` (regerado)
- `app/configuracoes/page.tsx`
- `app/configuracoes/actions.ts`
- `app/dashboard/page.tsx`
- `app/dashboard/EmailLoteList.tsx`
- `app/emails/[id]/page.tsx`
- `docs/divida-tecnica.md`

## 4. Ordem e paralelismo

- **Fase A (sequencial):** Tarefa 0 (preparação) → Tarefa 1 (migração).
- **Fase B (paralela):** Tarefas 2 a 8, módulos puros e independentes. Despache um subagente por tarefa, e cada um roda só o seu arquivo de teste.
- **Fase C (sequencial):** Tarefas 9, 10 e 11 (servidor, rotas, página pública) → Tarefas 12 e 13 (UI).
- **Fase D:** Tarefa 14 (revisão + deploy) → Tarefa 15 (**pausa: conectar o Gmail**) → Tarefa 16 (validação com e-mail real) → Tarefa 17 (agendamento) → Tarefa 18 (documentação e relatório).

Depois de cada fase, rode `npm test && npm run lint` e despache o subagente `superpowers:code-reviewer` contra este plano antes de seguir.

---

## Tarefa 0: Preparação e linha de base

**Arquivos:**
- Modificar: `tsconfig.json`, `package.json`

- [ ] **Passo 1: Conferir o ponto de partida**

Rode na raiz do painel:
```bash
git status --short && git log --oneline -3 && node -v && ls .fixtures-privadas
```
Esperado:
- árvore limpa;
- o commit deste plano no topo;
- Node ≥ 22.6;
- os 2 arquivos da fixture.

Se a fixture não existir, pare e avise o Leonardo: os testes da Tarefa 5 dependem dela.

- [ ] **Passo 2: Linha de base do build**

```bash
npm run lint && npm run build
```
Esperado: os dois passam. Se algo já estiver quebrado antes de você mexer, anote a saída e pare.

- [ ] **Passo 3: Habilitar import com extensão `.ts`**

Em `tsconfig.json`, dentro de `compilerOptions`, logo depois de `"noEmit": true,`, acrescente:
```json
    "allowImportingTsExtensions": true,
```
Motivo: os testes rodam com `node --experimental-strip-types`, que exige o caminho real `./parser.ts` nos imports entre módulos puros. O TypeScript só aceita isso com essa flag, que é permitida porque o projeto já tem `noEmit`. `strict` e `moduleResolution: "bundler"` ficam como estão.

- [ ] **Passo 4: Script de teste**

Em `package.json`, dentro de `scripts`, depois de `"lint": "eslint"`, acrescente:
```json
    "test": "node --experimental-strip-types --no-warnings=ExperimentalWarning --test \"lib/**/*.test.ts\""
```
Não remova nem renomeie scripts existentes.

- [ ] **Passo 5: Conferir que o runner funciona sem nenhum teste**

```bash
npm test
```
Esperado: termina com `# tests 0` (ou "no test files found"), sem erro de sintaxe na flag. Se o Node reclamar do glob, use a lista explícita `lib/gmail/*.test.ts`.

- [ ] **Passo 6: Commit**

```bash
git add tsconfig.json package.json
git commit -m "chore: script de teste com node:test e import .ts entre modulos puros"
```

---

## Tarefa 1: Migração do banco

**Tabelas afetadas:** `integracao_gmail` (nova), `emails_recebidos` (colunas novas), `processos` (índice novo). Nada é apagado.

- [ ] **Passo 1: Conferir que o estado ainda é o esperado**

Pelo MCP do Supabase (`execute_sql`):
```sql
select count(*) as emails from public.emails_recebidos;
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'emails_recebidos' order by ordinal_position;
select to_regclass('public.integracao_gmail') as ja_existe;
```
Esperado:
- `emails = 0`;
- as 6 colunas `id, remetente, assunto, data_recebimento, data_processamento, total_cnj`;
- `ja_existe = null`.

Se divergir, pare e mostre ao Leonardo.

- [ ] **Passo 2: Aplicar a migração**

Use `apply_migration` com o nome `ingestao_gmail_api` e este SQL:

```sql
create table public.integracao_gmail (
  id smallint primary key default 1 check (id = 1),
  email_conectado text not null,
  refresh_token_cifrado text not null,
  status text not null default 'conectado' check (status in ('conectado', 'desconectado')),
  ultimo_erro text,
  ultimo_erro_em timestamptz,
  ultima_sincronizacao_em timestamptz,
  ultima_sincronizacao_ok_em timestamptz,
  conectado_por uuid references public.usuarios (id),
  conectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.integracao_gmail is
  'Conta Gmail de onde vem a pauta da OAB. Uma linha só (id = 1). O refresh token é cifrado pelo painel (AES-256-GCM, chave GMAIL_TOKEN_ENCRYPTION_KEY). RLS ligada e sem policies: só o service role acessa.';

alter table public.integracao_gmail enable row level security;

alter table public.emails_recebidos
  add column gmail_message_id text,
  add column corpo_texto text,
  add column lote_id text,
  add column total_blocos integer,
  add column total_fint integer,
  add column total_validos integer,
  add column total_declarado integer,
  add column total_declarado_assunto integer,
  add column parser_status text check (parser_status in ('ok', 'divergente', 'sem_cnj', 'erro')),
  add column parser_versao text,
  add column parser_resultado jsonb,
  add column modo text check (modo in ('sombra', 'ativo')),
  add column aplicacao_status text check (aplicacao_status in ('sombra', 'antes_do_corte', 'pendente', 'aplicado', 'erro_aplicacao')),
  add column aplicado_em timestamptz,
  add column erro text;

comment on column public.emails_recebidos.gmail_message_id is 'ID da mensagem no Gmail. Único: é a deduplicação da ingestão (o painel não marca e-mail como lido).';
comment on column public.emails_recebidos.aplicacao_status is 'sombra = lido e não gravado em processos; antes_do_corte = pauta que o Cowork já gravou; pendente/aplicado/erro_aplicacao = modo ativo.';

create unique index emails_recebidos_gmail_message_id_key on public.emails_recebidos (gmail_message_id);
create index emails_recebidos_data_recebimento_idx on public.emails_recebidos (data_recebimento desc);
create index if not exists processos_email_id_idx on public.processos (email_id);
```

- [ ] **Passo 3: Verificar**

```sql
select relname, relrowsecurity from pg_class where relname in ('integracao_gmail', 'emails_recebidos');
select count(*) from pg_policies where tablename = 'integracao_gmail';
select indexname from pg_indexes where tablename in ('emails_recebidos', 'processos') and indexname like any (array['%gmail%', '%email_id%', '%data_recebimento%']);
```
Esperado:
- as duas tabelas com `relrowsecurity = true`;
- 0 policies;
- os 3 índices novos.

Depois rode `get_advisors` (tipo `security`). Não pode aparecer aviso novo sobre `integracao_gmail` além de "RLS enabled no policy", que é intencional.

- [ ] **Passo 4: Regerar os tipos**

Rode `generate_typescript_types` e substitua o conteúdo de `lib/supabase/types.ts` pelo resultado. Confira com `git diff --stat lib/supabase/types.ts` e `git diff lib/supabase/types.ts`. O diff só pode ter a tabela `integracao_gmail` e as colunas novas de `emails_recebidos`. Se sumir algo que existia, restaure e aplique só o trecho novo à mão.

- [ ] **Passo 5: Build e commit**

```bash
npm run build
git add lib/supabase/types.ts
git commit -m "feat(db): integracao_gmail e colunas de ingestao em emails_recebidos"
```

---

## Tarefa 2: Cifragem do refresh token

**Arquivos:**
- Criar: `lib/gmail/cripto.ts`
- Teste: `lib/gmail/cripto.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

`lib/gmail/cripto.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { cifrar, decifrar } from './cripto.ts'

const chave = randomBytes(32).toString('base64')

describe('cifragem do refresh token', () => {
  test('devolve o texto original ao decifrar com a mesma chave', () => {
    assert.equal(decifrar(cifrar('token-de-teste', chave), chave), 'token-de-teste')
  })

  test('gera um texto cifrado diferente a cada chamada', () => {
    assert.notEqual(cifrar('token-de-teste', chave), cifrar('token-de-teste', chave))
  })

  test('falha quando o conteúdo cifrado foi adulterado', () => {
    const partes = cifrar('token-de-teste', chave).split(':')
    const conteudo = Buffer.from(partes[3], 'base64')
    conteudo[0] = conteudo[0] ^ 1
    partes[3] = conteudo.toString('base64')
    assert.throws(() => decifrar(partes.join(':'), chave))
  })

  test('falha quando a chave é outra', () => {
    const outraChave = randomBytes(32).toString('base64')
    assert.throws(() => decifrar(cifrar('token-de-teste', chave), outraChave))
  })

  test('recusa chave que não tem 32 bytes', () => {
    assert.throws(() => cifrar('x', randomBytes(16).toString('base64')), /32 bytes/)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning --test lib/gmail/cripto.test.ts
```
Esperado: FAIL, com `Cannot find module` para `./cripto.ts`.

- [ ] **Passo 3: Implementar**

`lib/gmail/cripto.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Formato gravado no banco: v1:<iv>:<tag>:<conteúdo>, cada parte em base64.
// A versão na frente permite trocar o algoritmo sem perder os tokens já gravados.
const VERSAO = 'v1'

function lerChave(chaveBase64: string): Buffer {
  const chave = Buffer.from(chaveBase64, 'base64')
  if (chave.length !== 32) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY precisa ter 32 bytes em base64.')
  }
  return chave
}

export function cifrar(textoPlano: string, chaveBase64: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', lerChave(chaveBase64), iv)
  const conteudo = Buffer.concat([cifra.update(textoPlano, 'utf8'), cifra.final()])
  return [VERSAO, iv.toString('base64'), cifra.getAuthTag().toString('base64'), conteudo.toString('base64')].join(':')
}

export function decifrar(cifrado: string, chaveBase64: string): string {
  const [versao, iv, tag, conteudo] = cifrado.split(':')
  if (versao !== VERSAO || !iv || !tag || !conteudo) {
    throw new Error('Token cifrado em formato desconhecido.')
  }
  const decifra = createDecipheriv('aes-256-gcm', lerChave(chaveBase64), Buffer.from(iv, 'base64'))
  decifra.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decifra.update(Buffer.from(conteudo, 'base64')), decifra.final()]).toString('utf8')
}
```

- [ ] **Passo 4: Rodar e ver passar**

Mesmo comando do Passo 2. Esperado: `# pass 5`, `# fail 0`.

- [ ] **Passo 5: Commit**

```bash
git add lib/gmail/cripto.ts lib/gmail/cripto.test.ts
git commit -m "feat(gmail): cifragem AES-256-GCM do refresh token"
```

---

## Tarefa 3: Bearer e `state` em tempo constante

**Arquivos:**
- Criar: `lib/gmail/seguranca.ts`
- Teste: `lib/gmail/seguranca.test.ts`

- [ ] **Passo 1: Escrever o teste que falha**

`lib/gmail/seguranca.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { bearerValido, iguaisEmTempoConstante } from './seguranca.ts'

describe('comparação em tempo constante', () => {
  test('aceita valores iguais', () => {
    assert.equal(iguaisEmTempoConstante('abc123', 'abc123'), true)
  })

  test('recusa valores diferentes, inclusive de tamanhos diferentes', () => {
    assert.equal(iguaisEmTempoConstante('abc123', 'abc124'), false)
    assert.equal(iguaisEmTempoConstante('abc', 'abc123'), false)
  })
})

describe('Bearer da sincronização', () => {
  test('aceita o segredo certo', () => {
    assert.equal(bearerValido('Bearer segredo-certo', 'segredo-certo'), true)
  })

  test('recusa segredo errado e cabeçalho sem Bearer', () => {
    assert.equal(bearerValido('Bearer outro', 'segredo-certo'), false)
    assert.equal(bearerValido('segredo-certo', 'segredo-certo'), false)
  })

  test('recusa tudo quando o segredo não está configurado', () => {
    assert.equal(bearerValido('Bearer ', ''), false)
    assert.equal(bearerValido('Bearer undefined', undefined), false)
    assert.equal(bearerValido(null, undefined), false)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning --test lib/gmail/seguranca.test.ts
```
Esperado: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar**

`lib/gmail/seguranca.ts`:
```ts
import { createHash, timingSafeEqual } from 'node:crypto'

export const COOKIE_STATE_GMAIL = 'gmail_oauth_state'
export const COOKIE_STATE_PATH = '/api/gmail'

// Compara os hashes, e não os textos: timingSafeEqual exige o mesmo tamanho, e
// recusar pelo tamanho antes vazaria o tamanho do segredo.
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

export function bearerValido(cabecalho: string | null, segredo: string | undefined): boolean {
  if (!segredo || !cabecalho?.startsWith('Bearer ')) return false
  return iguaisEmTempoConstante(cabecalho.slice('Bearer '.length), segredo)
}
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: `# pass 5`, `# fail 0`.

- [ ] **Passo 5: Commit**

```bash
git add lib/gmail/seguranca.ts lib/gmail/seguranca.test.ts
git commit -m "feat(gmail): validacao do Bearer e do state em tempo constante"
```

---

## Tarefa 4: Leitura da árvore MIME do Gmail

**Arquivos:**
- Criar: `lib/gmail/mime.ts`
- Teste: `lib/gmail/mime.test.ts`

Contexto: com `messages.get?format=full`, o Gmail devolve `payload` em árvore (`parts`). Cada parte tem `mimeType`, `headers` e `body.data`: os bytes da parte já sem o quoted-printable/base64 do e-mail, mas ainda no charset original, codificados em base64url. O e-mail real é `multipart/related` > `multipart/alternative` > `text/plain` + `text/html` (windows-1252) + 3 PNG.

- [ ] **Passo 1: Escrever o teste que falha**

`lib/gmail/mime.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairTextoPlano, lerHeader, type GmailParte } from './mime.ts'

const TEXTO = 'Publicação: 1.\nVara: 1ª Vara Cível da Comarca de Cidade Teste'

function parteDeTexto(mimeType: string, texto: string, charset: string, codificacao: BufferEncoding): GmailParte {
  return {
    mimeType,
    headers: [{ name: 'Content-Type', value: `${mimeType}; charset="${charset}"` }],
    body: { data: Buffer.from(texto, codificacao).toString('base64url') },
  }
}

// windows-1252 e latin1 coincidem nos acentos do português (ç, ã, ª, í), então
// o 'latin1' do Buffer produz exatamente os bytes que o e-mail real traz
const EMAIL_DA_OAB: GmailParte = {
  mimeType: 'multipart/related',
  headers: [{ name: 'From', value: 'Intimações <Intimacoes@exemplo-adv.example>' }],
  parts: [
    {
      mimeType: 'multipart/alternative',
      parts: [
        parteDeTexto('text/plain', TEXTO, 'windows-1252', 'latin1'),
        parteDeTexto('text/html', '<p>html</p>', 'windows-1252', 'latin1'),
      ],
    },
    { mimeType: 'image/png', body: { attachmentId: 'imagem-1', size: 10 } },
  ],
}

describe('extração do text/plain', () => {
  test('decodifica base64url e depois o windows-1252 da parte', () => {
    assert.equal(extrairTextoPlano(EMAIL_DA_OAB)?.texto, TEXTO)
  })

  test('informa o charset usado', () => {
    assert.equal(extrairTextoPlano(EMAIL_DA_OAB)?.charset, 'windows-1252')
  })

  test('lê utf-8 quando a parte declara utf-8', () => {
    const payload = parteDeTexto('text/plain', TEXTO, 'utf-8', 'utf8')
    assert.equal(extrairTextoPlano(payload)?.texto, TEXTO)
  })

  test('devolve null quando não há text/plain', () => {
    const soHtml: GmailParte = { mimeType: 'multipart/alternative', parts: [parteDeTexto('text/html', '<p>x</p>', 'utf-8', 'utf8')] }
    assert.equal(extrairTextoPlano(soHtml), null)
  })

  test('ignora text/plain que vem como anexo', () => {
    const anexo = parteDeTexto('text/plain', 'anexo', 'utf-8', 'utf8')
    anexo.headers?.push({ name: 'Content-Disposition', value: 'attachment; filename="a.txt"' })
    const payload: GmailParte = { mimeType: 'multipart/mixed', parts: [anexo] }
    assert.equal(extrairTextoPlano(payload), null)
  })
})

describe('leitura de header', () => {
  test('acha o header sem diferenciar maiúsculas', () => {
    assert.equal(lerHeader(EMAIL_DA_OAB, 'from'), 'Intimações <Intimacoes@exemplo-adv.example>')
  })

  test('devolve null quando o header não existe', () => {
    assert.equal(lerHeader(EMAIL_DA_OAB, 'Subject'), null)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning --test lib/gmail/mime.test.ts
```
Esperado: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar**

`lib/gmail/mime.ts`:
```ts
export interface GmailHeader {
  name: string
  value: string
}

export interface GmailParte {
  mimeType?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailParte[]
}

export interface TextoExtraido {
  texto: string
  charset: string
}

export function lerHeader(parte: GmailParte, nome: string): string | null {
  const alvo = nome.toLowerCase()
  return parte.headers?.find((header) => header.name.toLowerCase() === alvo)?.value ?? null
}

function charsetDaParte(parte: GmailParte): string {
  const achado = /charset\s*=\s*"?([^";\s]+)"?/i.exec(lerHeader(parte, 'Content-Type') ?? '')
  return achado ? achado[1].toLowerCase() : 'utf-8'
}

function ehAnexo(parte: GmailParte): boolean {
  return /attachment/i.test(lerHeader(parte, 'Content-Disposition') ?? '')
}

function decodificar(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    // charset que o runtime não conhece: utf-8 perde acento, mas não perde o CNJ
    return new TextDecoder('utf-8').decode(bytes)
  }
}

// Busca em largura: o text/plain do e-mail fica mais perto da raiz do que o de
// uma mensagem encaminhada como anexo lá dentro.
export function extrairTextoPlano(raiz: GmailParte): TextoExtraido | null {
  const fila: GmailParte[] = [raiz]
  while (fila.length > 0) {
    const parte = fila.shift()
    if (!parte) break
    if (parte.mimeType === 'text/plain' && parte.body?.data && !ehAnexo(parte)) {
      const charset = charsetDaParte(parte)
      return { texto: decodificar(Buffer.from(parte.body.data, 'base64url'), charset), charset }
    }
    fila.push(...(parte.parts ?? []))
  }
  return null
}
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: `# pass 7`, `# fail 0`.

- [ ] **Passo 5: Commit**

```bash
git add lib/gmail/mime.ts lib/gmail/mime.test.ts
git commit -m "feat(gmail): extracao do text/plain com charset da parte"
```

---

## Tarefa 5: Parser da pauta (TDD)

**Arquivos:**
- Criar: `lib/gmail/parser.ts`
- Teste sintético (versionado): `lib/gmail/parser.test.ts`
- Teste com a pauta real (versionado, mas lê a fixture fora do git): `lib/gmail/parser.fixture.test.ts`

As regras vêm da seção 2 e da tarefa do Cowork. Escreva **todos** os testes antes do código.

- [ ] **Passo 1: Escrever os testes sintéticos**

`lib/gmail/parser.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairLoteId, identificarSistema, parsearPauta, type SistemaProcesso } from './parser.ts'

const CNJ_PJE = '5000001-11.2099.8.13.0001'
const CNJ_EPROC = '1000002-22.2099.8.13.0001'
const CNJ_TRF6 = '6000003-33.2099.4.06.0001'
const CNJ_DESCONHECIDO = '9000004-44.2099.8.13.0001'

interface OpcoesBloco {
  tribunal?: string
  vara?: string | null
  cidade?: string
  corpo: string
}

function bloco(numero: number, opcoes: OpcoesBloco): string {
  const linhas = [
    `Publicação: ${numero}.`,
    '',
    'Data de Disponibilização: 01/01/2099',
    `Tribunal: ${opcoes.tribunal ?? 'DJEN - Diário de Justiça Eletrônico Nacional - TJMG'}`,
  ]
  if (opcoes.cidade) linhas.push(`Cidade: ${opcoes.cidade}`)
  if (opcoes.vara !== null) linhas.push(`Vara: ${opcoes.vara ?? '1ª Vara Cível da Comarca de Cidade Teste'}`)
  linhas.push('Título: Intimação', 'Publicação: Intimação', '', opcoes.corpo, '', '')
  return linhas.join('\n')
}

function corpoPadrao(cnj: string): string {
  return [
    `PROCESSO: ${cnj} - PROCEDIMENTO COMUM CiVEL - || texto do ato |||`,
    'POLO ATIVO: FULANO DE TAL',
    'ADVOGADO: ADVOGADO FICTICIO - OAB: 000001/MG',
  ].join('\n')
}

function ler(blocos: string[], totais: { corpo?: number; assunto?: number } = {}) {
  const assunto = `ENC: Recorte Digital OAB/MG - Pauta MG 01/01/99, DJ 01/01/99 - total ${totais.assunto ?? blocos.length} publicações.`
  const corpo = [
    'opa',
    '',
    'Recorte Digital - OAB - Resultado da Busca',
    '',
    ...blocos,
    `Total de Publicações: ${totais.corpo ?? blocos.length}`,
    '',
  ].join('\n')
  return parsearPauta(assunto, corpo)
}

describe('lote da pauta', () => {
  test('usa a 1ª data do assunto e completa o ano de 2 dígitos', () => {
    assert.equal(extrairLoteId('ENC: Recorte Digital OAB/MG - Pauta MG 15/06/26, DJ 16/06/26 - total 3 publicações.'), '15/06/2026')
  })

  test('aceita ano com 4 dígitos', () => {
    assert.equal(extrairLoteId('RES: Pauta MG 01/09/2026, DJ 02/09/2026'), '01/09/2026')
  })

  test('devolve null quando o assunto não tem data', () => {
    assert.equal(extrairLoteId('Fwd: Recorte Digital'), null)
  })
})

describe('divisão em blocos', () => {
  test('abre um bloco por "Publicação: N." e ignora "Publicação: Intimação"', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) }), bloco(2, { corpo: corpoPadrao(CNJ_EPROC) })])
    assert.equal(resultado.totalBlocos, 2)
    assert.deepEqual(resultado.processos.map((p) => p.numeroPublicacao), [1, 2])
  })

  test('descarta bloco FINT de todas as contagens', () => {
    const resultado = ler([
      bloco(1, { tribunal: 'FINT', vara: '2º JUIZADO ESPECIAL DA COMARCA DE X', corpo: `00060 - ${CNJ_TRF6}` }),
      bloco(2, { corpo: corpoPadrao(CNJ_PJE) }),
    ])
    assert.equal(resultado.totalFint, 1)
    assert.equal(resultado.totalValidos, 1)
    assert.deepEqual(resultado.processos.map((p) => p.numeroCnj), [CNJ_PJE])
  })

  test('pula bloco sem CNJ e avisa', () => {
    const resultado = ler([bloco(1, { corpo: 'sem número de processo' }), bloco(2, { corpo: corpoPadrao(CNJ_PJE) })])
    assert.equal(resultado.totalSemCnj, 1)
    assert.ok(resultado.avisos.some((aviso) => aviso.startsWith('Publicação 1: sem número CNJ')))
  })
})

describe('campos do processo', () => {
  test('separa "X da Comarca de Y" em vara e comarca', () => {
    const [processo] = ler([bloco(1, { vara: '2ª Vara Cível da Comarca de Cidade Teste', corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.vara, '2ª Vara Cível')
    assert.equal(processo.comarca, 'Cidade Teste')
  })

  test('sem "da Comarca de", a vara é a linha inteira e a comarca vem de Cidade:', () => {
    const vara = 'Cartório da 1ª Câmara Cível – Praça Teste'
    const [processo] = ler([bloco(1, { vara, cidade: 'Cidade Teste', corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.vara, vara)
    assert.equal(processo.comarca, 'Cidade Teste')
  })

  test('junta vários POLO ATIVO com " | "', () => {
    const corpo = `PROCESSO: ${CNJ_PJE} - X - ||\nPOLO ATIVO: FULANO DE TAL\nPOLO ATIVO: BELTRANO DE TAL\nPOLO PASSIVO: EMPRESA FICTICIA`
    const [processo] = ler([bloco(1, { corpo })]).processos
    assert.equal(processo.poloAtivo, 'FULANO DE TAL | BELTRANO DE TAL')
  })

  test('emenda ao POLO PASSIVO a linha que continua o nome', () => {
    const corpo = `PROCESSO: ${CNJ_PJE} - X - ||\nPOLO ATIVO: FULANO DE TAL\nPOLO PASSIVO: BANCO FICTICIO\nCONSIGNADO S.A.\nADVOGADO: ADVOGADO FICTICIO - OAB: 1/MG`
    const [processo] = ler([bloco(1, { corpo })]).processos
    assert.equal(processo.poloPassivo, 'BANCO FICTICIO CONSIGNADO S.A.')
    assert.equal(processo.poloAtivo, 'FULANO DE TAL')
  })

  test('sem POLO PASSIVO, o campo fica null', () => {
    const [processo] = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.poloPassivo, null)
  })

  test('lê a classe do CLASSE: sem o [CÍVEL] e sem o (7)', () => {
    const corpo = `PROCESSO: ${CNJ_PJE} - OUTRA - || x |||\nPROCESSO Nº: ${CNJ_PJE}\nCLASSE: [CÍVEL] PROCEDIMENTO COMUM CÍVEL (7) FULANO DE TAL CPF: 000`
    const [processo] = ler([bloco(1, { corpo })]).processos
    assert.equal(processo.classeProcessual, 'PROCEDIMENTO COMUM CÍVEL')
  })

  test('sem CLASSE:, lê a classe entre o CNJ e o || da linha PROCESSO:', () => {
    const [processo] = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })]).processos
    assert.equal(processo.classeProcessual, 'PROCEDIMENTO COMUM CiVEL')
  })
})

describe('sistema do processo', () => {
  const casos: { descricao: string; cnj: string; vara: string | null; esperado: SistemaProcesso | null }[] = [
    { descricao: 'vara + dígito 1 = eProc TJMG', cnj: CNJ_EPROC, vara: '1ª Vara Cível da Comarca de X', esperado: 'eproc_tjmg' },
    { descricao: 'vara + dígito 5 = PJe', cnj: CNJ_PJE, vara: 'Vara Única da Comarca de X', esperado: 'pje' },
    { descricao: 'vara + dígito 6 = eProc TRF6', cnj: CNJ_TRF6, vara: 'Vara Cível e JEF Adjunto de X', esperado: 'eproc_trf6' },
    { descricao: 'câmara do TJMG = 2ª instância', cnj: CNJ_PJE, vara: 'TJMG - 10ª CÂMARA CÍVEL', esperado: 'pje_2g' },
    { descricao: 'cartório de câmara = 2ª instância', cnj: CNJ_PJE, vara: 'Cartório da 14ª Câmara Cível – Praça Teste', esperado: 'pje_2g' },
    { descricao: 'juizado especial é 1ª instância', cnj: CNJ_PJE, vara: '2º JUIZADO ESPECIAL DA COMARCA DE X', esperado: 'pje' },
    { descricao: 'sem linha Vara, vale o dígito', cnj: CNJ_EPROC, vara: null, esperado: 'eproc_tjmg' },
    { descricao: 'dígito desconhecido = null', cnj: CNJ_DESCONHECIDO, vara: '1ª Vara Cível', esperado: null },
  ]
  for (const caso of casos) {
    test(`classifica: ${caso.descricao}`, () => {
      assert.equal(identificarSistema(caso.cnj, caso.vara), caso.esperado)
    })
  }

  test('avisa quando o sistema não é identificado', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_DESCONHECIDO) })])
    assert.ok(resultado.avisos.some((aviso) => aviso.includes('sistema não identificado')))
  })
})

describe('CNJ repetido na pauta', () => {
  test('anota "Duplicado na pauta: Nx, publicações A, B" e fica com o número do último bloco', () => {
    const resultado = ler([
      bloco(1, { corpo: corpoPadrao(CNJ_PJE) }),
      bloco(2, { corpo: corpoPadrao(CNJ_EPROC) }),
      bloco(3, { corpo: corpoPadrao(CNJ_PJE) }),
    ])
    const repetido = resultado.processos.find((p) => p.numeroCnj === CNJ_PJE)
    assert.equal(repetido?.observacoes, 'Duplicado na pauta: 2x, publicações 1, 3')
    assert.equal(repetido?.numeroPublicacao, 3)
    assert.equal(resultado.processos.find((p) => p.numeroCnj === CNJ_EPROC)?.observacoes, null)
  })

  test('o último bloco define os campos, e campo vazio nele herda do anterior', () => {
    const resultado = ler([
      bloco(1, { corpo: corpoPadrao(CNJ_PJE) }),
      bloco(2, { vara: '2ª Vara Cível da Comarca de Outra Cidade', corpo: `PROCESSO: ${CNJ_PJE} - X - ||` }),
    ])
    const [processo] = resultado.processos
    assert.equal(processo.vara, '2ª Vara Cível')
    assert.equal(processo.poloAtivo, 'FULANO DE TAL')
  })

  test('bloco FINT não conta como repetição', () => {
    const resultado = ler([
      bloco(1, { tribunal: 'FINT', corpo: `00060 - ${CNJ_PJE}` }),
      bloco(2, { corpo: corpoPadrao(CNJ_PJE) }),
    ])
    assert.equal(resultado.processos[0].observacoes, null)
  })
})

describe('conferência dos totais', () => {
  test('status ok quando blocos, corpo e assunto batem', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) }), bloco(2, { corpo: corpoPadrao(CNJ_EPROC) })])
    assert.equal(resultado.status, 'ok')
    assert.equal(resultado.totalDeclaradoCorpo, 2)
    assert.equal(resultado.totalDeclaradoAssunto, 2)
  })

  test('status divergente quando o corpo declara outro total', () => {
    const resultado = ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })], { corpo: 4 })
    assert.equal(resultado.status, 'divergente')
    assert.ok(resultado.avisos.includes('1 blocos lidos, mas o corpo declara 4.'))
  })

  test('status sem_cnj quando nenhum bloco tem CNJ', () => {
    const resultado = ler([bloco(1, { corpo: 'nada aqui' })])
    assert.equal(resultado.status, 'sem_cnj')
  })

  test('grava o lote da pauta', () => {
    assert.equal(ler([bloco(1, { corpo: corpoPadrao(CNJ_PJE) })]).loteId, '01/01/2099')
  })
})
```

- [ ] **Passo 2: Escrever o teste com a pauta real**

`lib/gmail/parser.fixture.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsearPauta } from './parser.ts'

// A pauta real tem nome, CPF e processo de cliente: fica em .fixtures-privadas/,
// fora do git. Sem ela (outra máquina), este arquivo só registra o pulo.
const PASTA = join(process.cwd(), '.fixtures-privadas')
const ARQUIVO_TEXTO = join(PASTA, 'pauta-15-06-26.txt')
const ARQUIVO_ESPERADO = join(PASTA, 'pauta-15-06-26.esperado.json')

interface Esperado {
  assunto: string
  loteId: string
  totalBlocos: number
  totalFint: number
  totalValidos: number
  cnjsUnicos: number
  repetidos: Record<string, number[]>
  segundaInstancia: string[]
  poloPassivoEmDuasLinhas: { cnj: string; poloPassivo: string }
}

if (!existsSync(ARQUIVO_TEXTO) || !existsSync(ARQUIVO_ESPERADO)) {
  test('pauta real de 15/06/2026', { skip: 'fixture ausente em .fixtures-privadas/' }, () => {})
} else {
  const esperado = JSON.parse(readFileSync(ARQUIVO_ESPERADO, 'utf8')) as Esperado
  const resultado = parsearPauta(esperado.assunto, readFileSync(ARQUIVO_TEXTO, 'utf8'))
  const porCnj = new Map(resultado.processos.map((p) => [p.numeroCnj, p]))

  describe('pauta real de 15/06/2026', () => {
    test('lê 52 blocos, 20 FINT e 32 válidos', () => {
      assert.equal(resultado.totalBlocos, esperado.totalBlocos)
      assert.equal(resultado.totalFint, esperado.totalFint)
      assert.equal(resultado.totalValidos, esperado.totalValidos)
    })

    test('encontra 29 CNJs únicos e fecha com os totais declarados', () => {
      assert.equal(resultado.processos.length, esperado.cnjsUnicos)
      assert.equal(resultado.status, 'ok')
    })

    test('usa o lote 15/06/2026', () => {
      assert.equal(resultado.loteId, esperado.loteId)
    })

    test('marca os 3 repetidos com as publicações certas', () => {
      for (const [cnj, publicacoes] of Object.entries(esperado.repetidos)) {
        assert.deepEqual(porCnj.get(cnj)?.publicacoes, publicacoes)
      }
    })

    test('classifica as câmaras do TJMG como pje_2g', () => {
      for (const cnj of esperado.segundaInstancia) {
        assert.equal(porCnj.get(cnj)?.sistema, 'pje_2g')
      }
    })

    test('emenda o polo passivo quebrado em duas linhas', () => {
      const { cnj, poloPassivo } = esperado.poloPassivoEmDuasLinhas
      assert.equal(porCnj.get(cnj)?.poloPassivo, poloPassivo)
    })

    test('nenhum processo fica sem sistema', () => {
      assert.deepEqual(resultado.processos.filter((p) => p.sistema === null).map((p) => p.numeroPublicacao), [])
    })
  })
}
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning --test lib/gmail/parser.test.ts lib/gmail/parser.fixture.test.ts
```
Esperado: FAIL (módulo não existe).

- [ ] **Passo 4: Implementar**

`lib/gmail/parser.ts`:
```ts
// Leitura do e-mail do Recorte Digital (OAB/MG). Função pura: nada de banco, nada de
// rede — ver parser.test.ts (dados inventados) e parser.fixture.test.ts (pauta real).
// As regras vêm da tarefa do Cowork; os desvios deliberados estão no plano de
// docs/superpowers/plans/2026-09-10-ingestao-gmail-api.md, seção 2.

export type SistemaProcesso = 'pje' | 'pje_2g' | 'eproc_tjmg' | 'eproc_trf6'
export type StatusParser = 'ok' | 'divergente' | 'sem_cnj'

export interface ProcessoDaPauta {
  numeroCnj: string
  numeroPublicacao: number
  publicacoes: number[]
  vara: string | null
  comarca: string | null
  poloAtivo: string | null
  poloPassivo: string | null
  classeProcessual: string | null
  sistema: SistemaProcesso | null
  observacoes: string | null
}

export interface ResultadoParser {
  loteId: string | null
  totalBlocos: number
  totalFint: number
  totalValidos: number
  totalSemCnj: number
  totalDeclaradoCorpo: number | null
  totalDeclaradoAssunto: number | null
  processos: ProcessoDaPauta[]
  avisos: string[]
  status: StatusParser
}

// Mudou a regra de leitura? Suba a versão: fica gravada em emails_recebidos.parser_versao.
export const VERSAO_PARSER = '1'

const PADRAO_CNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/
// "Publicação: 12." abre bloco; "Publicação: Intimação" é o tipo do ato e não abre.
const INICIO_DE_BLOCO = /^Publica[çc][ãa]o:\s*(\d+)\.\s*$/gm
// Linha que começa um campo novo ("ADVOGADO:", "POLO PASSIVO:", "RELATOR :"). O que
// não casa com isto, logo depois de um POLO, é continuação do nome que quebrou a linha.
const LINHA_COM_ROTULO = /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 ().ºª°\/-]*\s*:/
const DIGITO_PARA_SISTEMA: Record<string, SistemaProcesso> = {
  '1': 'eproc_tjmg',
  '5': 'pje',
  '6': 'eproc_trf6',
}

interface Bloco {
  numero: number
  texto: string
}

export function extrairLoteId(assunto: string): string | null {
  const achado = /(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?!\d)/.exec(assunto)
  if (!achado) return null
  const [, dia, mes, ano] = achado
  return `${dia}/${mes}/${ano.length === 2 ? `20${ano}` : ano}`
}

// 1ª instância sempre traz "vara" (ou "juizado") na linha Vara; a 2ª usa Câmara,
// Turma, Cartório... Decidido com o Leonardo em 10/09/2026: juizado é 1ª instância.
export function identificarSistema(numeroCnj: string, linhaVara: string | null): SistemaProcesso | null {
  if (linhaVara !== null && !/\b(vara|juizado)\b/i.test(linhaVara)) return 'pje_2g'
  return DIGITO_PARA_SISTEMA[numeroCnj.charAt(0)] ?? null
}

function dividirEmBlocos(corpo: string): Bloco[] {
  const marcas = [...corpo.matchAll(INICIO_DE_BLOCO)]
  return marcas.map((marca, indice) => {
    const inicio = (marca.index ?? 0) + marca[0].length
    const proxima = marcas[indice + 1]
    const fim = proxima ? (proxima.index ?? corpo.length) : corpo.length
    return { numero: Number(marca[1]), texto: corpo.slice(inicio, fim) }
  })
}

function campoSimples(texto: string, rotulo: string): string | null {
  const achado = new RegExp(`^${rotulo}:[ \\t]*(.+)$`, 'm').exec(texto)
  const valor = achado?.[1].trim()
  return valor ? valor : null
}

function valoresDoCampo(linhas: string[], rotulo: string): string[] {
  const valores: string[] = []
  linhas.forEach((linha, indice) => {
    if (!linha.startsWith(rotulo)) return
    const partes = [linha.slice(rotulo.length)]
    for (const seguinte of linhas.slice(indice + 1)) {
      if (!seguinte || LINHA_COM_ROTULO.test(seguinte)) break
      partes.push(seguinte)
    }
    const valor = partes
      .join(' ')
      .replace(/\s+(?:ADVOGADO|CPF|CNPJ)\b.*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (valor) valores.push(valor)
  })
  return valores
}

function separarVaraComarca(linhaVara: string | null, cidade: string | null): { vara: string | null; comarca: string | null } {
  if (linhaVara === null) return { vara: null, comarca: cidade }
  const achado = /^(.*?)\s+da\s+Comarca\s+de\s+(.+)$/i.exec(linhaVara)
  if (achado) return { vara: achado[1].trim(), comarca: achado[2].trim() }
  return { vara: linhaVara, comarca: cidade }
}

function extrairClasse(texto: string, numeroCnj: string): string | null {
  const porClasse = /^CLASSE:\s*(?:\[.+?\]\s*)?([^\n(]+)/m.exec(texto)?.[1].trim()
  if (porClasse) return porClasse
  const linhaProcesso = /^PROCESSO:(.*)$/m.exec(texto)?.[1] ?? ''
  const depoisDoCnj = linhaProcesso.split(numeroCnj)[1] ?? ''
  const classe = depoisDoCnj
    .split('||')[0]
    .replace(/^\s*-\s*/, '')
    .replace(/\s*-\s*$/, '')
    .trim()
  return classe ? classe : null
}

function juntar(valores: string[]): string | null {
  return valores.length > 0 ? valores.join(' | ') : null
}

function lerProcesso(bloco: Bloco, numeroCnj: string, avisos: string[]): ProcessoDaPauta {
  const linhas = bloco.texto.split('\n').map((linha) => linha.trim())
  const linhaVara = campoSimples(bloco.texto, 'Vara')
  const { vara, comarca } = separarVaraComarca(linhaVara, campoSimples(bloco.texto, 'Cidade'))
  const sistema = identificarSistema(numeroCnj, linhaVara)
  if (linhaVara === null) {
    avisos.push(`Publicação ${bloco.numero} (${numeroCnj}): sem linha "Vara:", sistema pelo 1º dígito.`)
  }
  if (sistema === null) {
    avisos.push(`Publicação ${bloco.numero} (${numeroCnj}): sistema não identificado, revisar à mão.`)
  }
  return {
    numeroCnj,
    numeroPublicacao: bloco.numero,
    publicacoes: [bloco.numero],
    vara,
    comarca,
    poloAtivo: juntar(valoresDoCampo(linhas, 'POLO ATIVO:')),
    poloPassivo: juntar(valoresDoCampo(linhas, 'POLO PASSIVO:')),
    classeProcessual: extrairClasse(bloco.texto, numeroCnj),
    sistema,
    observacoes: null,
  }
}

// O último bloco manda (regra do Cowork), mas campo que ele não trouxe herda do anterior.
function mesclar(anterior: ProcessoDaPauta, atual: ProcessoDaPauta): ProcessoDaPauta {
  const publicacoes = [...anterior.publicacoes, ...atual.publicacoes]
  return {
    numeroCnj: atual.numeroCnj,
    numeroPublicacao: atual.numeroPublicacao,
    publicacoes,
    vara: atual.vara ?? anterior.vara,
    comarca: atual.comarca ?? anterior.comarca,
    poloAtivo: atual.poloAtivo ?? anterior.poloAtivo,
    poloPassivo: atual.poloPassivo ?? anterior.poloPassivo,
    classeProcessual: atual.classeProcessual ?? anterior.classeProcessual,
    sistema: atual.sistema ?? anterior.sistema,
    observacoes: `Duplicado na pauta: ${publicacoes.length}x, publicações ${publicacoes.join(', ')}`,
  }
}

function numeroCapturado(padrao: RegExp, texto: string): number | null {
  const achado = padrao.exec(texto)
  return achado ? Number(achado[1]) : null
}

function conferirTotal(origem: string, declarado: number | null, lidos: number, avisos: string[]): void {
  if (declarado === null) avisos.push(`Total de publicações não encontrado no ${origem}.`)
  else if (declarado !== lidos) avisos.push(`${lidos} blocos lidos, mas o ${origem} declara ${declarado}.`)
}

export function parsearPauta(assunto: string, corpoOriginal: string): ResultadoParser {
  const corpo = corpoOriginal.replace(/\r\n?/g, '\n')
  const blocos = dividirEmBlocos(corpo)
  const avisos: string[] = []
  const porCnj = new Map<string, ProcessoDaPauta>()
  let totalFint = 0
  let totalValidos = 0
  let totalSemCnj = 0

  for (const bloco of blocos) {
    const tribunal = campoSimples(bloco.texto, 'Tribunal')
    // FINT é expediente sem efeito de intimação: sai de todas as contagens, inclusive a de repetidos
    if (tribunal !== null && /^FINT\b/i.test(tribunal)) {
      totalFint++
      continue
    }
    const numeroCnj = PADRAO_CNJ.exec(bloco.texto)?.[0]
    if (!numeroCnj) {
      totalSemCnj++
      avisos.push(`Publicação ${bloco.numero}: sem número CNJ, pulada.`)
      continue
    }
    totalValidos++
    const processo = lerProcesso(bloco, numeroCnj, avisos)
    const anterior = porCnj.get(numeroCnj)
    porCnj.set(numeroCnj, anterior ? mesclar(anterior, processo) : processo)
  }

  const totalDeclaradoCorpo = numeroCapturado(/Total de Publica[çc][õo]es:\s*(\d+)/i, corpo)
  const totalDeclaradoAssunto = numeroCapturado(/total\s+(\d+)\s+publica/i, assunto)
  conferirTotal('corpo', totalDeclaradoCorpo, blocos.length, avisos)
  conferirTotal('assunto', totalDeclaradoAssunto, blocos.length, avisos)

  const processos = [...porCnj.values()].sort((a, b) => a.numeroPublicacao - b.numeroPublicacao)
  const totaisBatem = totalDeclaradoCorpo === blocos.length && totalDeclaradoAssunto === blocos.length
  const esperavaPublicacao = blocos.length > 0 || (totalDeclaradoCorpo ?? 0) > 0 || (totalDeclaradoAssunto ?? 0) > 0
  const status: StatusParser =
    processos.length === 0 && esperavaPublicacao ? 'sem_cnj' : totaisBatem ? 'ok' : 'divergente'

  return {
    loteId: extrairLoteId(assunto),
    totalBlocos: blocos.length,
    totalFint,
    totalValidos,
    totalSemCnj,
    totalDeclaradoCorpo,
    totalDeclaradoAssunto,
    processos,
    avisos,
    status,
  }
}
```

- [ ] **Passo 5: Rodar e ver passar**

Mesmo comando do Passo 3. Esperado:
- `# fail 0`;
- nenhum `skip` no arquivo da fixture (a fixture existe nesta máquina).

Se algum número da pauta real não fechar, **não mexa no `.esperado.json`**: os números foram conferidos à mão. Investigue o parser com a skill `superpowers:systematic-debugging` e, se a divergência for de regra (não de bug), pare e pergunte ao Leonardo.

- [ ] **Passo 6: Commit**

Confira antes que nada de `.fixtures-privadas/` entrou:
```bash
git status --short
git add lib/gmail/parser.ts lib/gmail/parser.test.ts lib/gmail/parser.fixture.test.ts
git commit -m "feat(gmail): parser da pauta do Recorte Digital com conferencia de totais"
```

---

## Tarefa 6: Regras de gravação em `processos`

**Arquivos:**
- Criar: `lib/gmail/gravacao.ts`
- Teste: `lib/gmail/gravacao.test.ts`

Porta de `aviso_publicacao_ignorada` (`../controladoria-playwright/runner.py`) e as regras da decisão 2. Também o corte da ativação: o `lote_id` é texto `DD/MM/AAAA`, e comparar como texto erra ("31/08/2026" > "08/09/2026"). Comparar como data.

- [ ] **Passo 1: Escrever o teste que falha**

`lib/gmail/gravacao.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoPublicacaoIgnorada, decidirGravacao, ehDataDeLote, loteDepoisDoCorte } from './gravacao.ts'
import type { ProcessoDaPauta } from './parser.ts'

const HOJE = new Date('2026-09-10T15:00:00Z')

function processo(campos: Partial<ProcessoDaPauta> = {}): ProcessoDaPauta {
  return {
    numeroCnj: '5000001-11.2099.8.13.0001',
    numeroPublicacao: 3,
    publicacoes: [3],
    vara: '1ª Vara Cível',
    comarca: 'Cidade Teste',
    poloAtivo: 'FULANO DE TAL',
    poloPassivo: null,
    classeProcessual: 'PROCEDIMENTO COMUM CÍVEL',
    sistema: 'pje',
    observacoes: null,
    ...campos,
  }
}

const CONTEXTO = { loteId: '09/09/2026', emailId: 'email-1' }

describe('aviso de publicação nova em processo tratado na mão', () => {
  test('escreve a data da pauta em DD/MM/AAAA', () => {
    assert.equal(
      avisoPublicacaoIgnorada('2026-08-19', null, HOJE),
      'Publicação nova em 19/08/2026 — processo tratado na mão, não voltou para a fila.',
    )
  })

  test('aceita lote que já vem em DD/MM/AAAA', () => {
    assert.ok(avisoPublicacaoIgnorada('19/08/2026', null, HOJE).includes('19/08/2026'))
  })

  test('põe a pauta mais recente em cima', () => {
    const antigo = avisoPublicacaoIgnorada('18/08/2026', null, HOJE)
    const [primeira, segunda] = avisoPublicacaoIgnorada('19/08/2026', antigo, HOJE).split('\n')
    assert.ok(primeira.includes('19/08/2026'))
    assert.ok(segunda.includes('18/08/2026'))
  })

  test('não repete a mesma pauta', () => {
    const uma = avisoPublicacaoIgnorada('19/08/2026', null, HOJE)
    assert.equal(avisoPublicacaoIgnorada('19/08/2026', uma, HOJE), uma)
  })

  test('guarda no máximo 10 linhas', () => {
    let texto: string | null = null
    for (let dia = 1; dia <= 15; dia++) {
      texto = avisoPublicacaoIgnorada(`${String(dia).padStart(2, '0')}/07/2026`, texto, HOJE)
    }
    assert.equal(texto?.split('\n').length, 10)
  })

  test('mantém a anotação escrita à mão embaixo do aviso', () => {
    assert.ok(avisoPublicacaoIgnorada('19/08/2026', 'anotação escrita à mão', HOJE).endsWith('\nanotação escrita à mão'))
  })

  test('sem lote, usa a data de hoje em Brasília', () => {
    assert.ok(avisoPublicacaoIgnorada(null, null, HOJE).includes('10/09/2026'))
  })
})

describe('decisão de gravação', () => {
  test('tratado na mão: só escreve o aviso e não mexe no status', () => {
    const gravacao = decidirGravacao(processo(), { pje_status: 'tratado_manual', observacoes: null }, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'avisar_tratado_manual')
  })

  test('processado volta para pendente sem virar duplicata', () => {
    const gravacao = decidirGravacao(processo(), { pje_status: 'processado', observacoes: null }, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo, 'atualizar')
    assert.equal(gravacao.tipo !== 'avisar_tratado_manual' && gravacao.dados.pje_status, 'pendente')
    assert.equal(gravacao.tipo !== 'avisar_tratado_manual' && gravacao.dados.duplicata, false)
  })

  test('CNJ novo é inserido', () => {
    assert.equal(decidirGravacao(processo(), undefined, CONTEXTO, HOJE).tipo, 'inserir')
  })

  test('campo que a publicação não trouxe não apaga o do banco', () => {
    const gravacao = decidirGravacao(processo({ vara: null }), undefined, CONTEXTO, HOJE)
    assert.equal(gravacao.tipo !== 'avisar_tratado_manual' && 'vara' in gravacao.dados, false)
  })

  test('grava fonte gmail_api, número da publicação como texto e o aviso de duplicado', () => {
    const observacoes = 'Duplicado na pauta: 2x, publicações 1, 3'
    const gravacao = decidirGravacao(processo({ observacoes }), undefined, CONTEXTO, HOJE)
    assert.deepEqual(
      gravacao.tipo !== 'avisar_tratado_manual' && [gravacao.dados.fonte, gravacao.dados.numero_publicacao, gravacao.dados.observacoes],
      ['gmail_api', '3', observacoes],
    )
  })
})

describe('corte da ativação', () => {
  test('09/09/2026 vem depois de 08/09/2026', () => {
    assert.equal(loteDepoisDoCorte('09/09/2026', '08/09/2026'), true)
  })

  test('compara como data, não como texto: 31/08/2026 vem antes de 08/09/2026', () => {
    assert.equal(loteDepoisDoCorte('31/08/2026', '08/09/2026'), false)
  })

  test('o próprio dia do corte não passa', () => {
    assert.equal(loteDepoisDoCorte('08/09/2026', '08/09/2026'), false)
  })

  test('sem lote não passa do corte', () => {
    assert.equal(loteDepoisDoCorte(null, '08/09/2026'), false)
  })

  test('reconhece data de lote válida', () => {
    assert.equal(ehDataDeLote('08/09/2026'), true)
    assert.equal(ehDataDeLote('2026-09-08'), false)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning --test lib/gmail/gravacao.test.ts
```
Esperado: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar**

`lib/gmail/gravacao.ts`:
```ts
import { PJE_STATUS_TRATADO_MANUAL } from '../status.ts'
import type { ProcessoDaPauta, SistemaProcesso } from './parser.ts'

// Mesmo texto e mesmos limites de aviso_publicacao_ignorada em runner.py: o painel já
// mostra observacoes em três telas, e o agente e a ingestão escrevem no mesmo formato.
const MARCA_AVISO = 'Publicação nova em '
const AVISO_MAX_LINHAS = 10

export interface LinhaExistente {
  pje_status: string | null
  observacoes: string | null
}

export interface DadosProcesso {
  numero_cnj: string
  lote_id: string | null
  numero_publicacao: string
  fonte: 'gmail_api'
  email_id: string
  pje_status: 'pendente'
  duplicata: false
  observacoes: string | null
  vara?: string
  comarca?: string
  polo_ativo?: string
  polo_passivo?: string
  classe_processual?: string
  sistema?: SistemaProcesso
}

export type Gravacao =
  | { tipo: 'inserir'; dados: DadosProcesso }
  | { tipo: 'atualizar'; dados: DadosProcesso }
  | { tipo: 'avisar_tratado_manual'; observacoes: string }

function paraData(ddmmaaaa: string): number | null {
  const achado = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmaaaa.trim())
  return achado ? Date.UTC(Number(achado[3]), Number(achado[2]) - 1, Number(achado[1])) : null
}

export function ehDataDeLote(valor: string): boolean {
  return paraData(valor) !== null
}

export function loteDepoisDoCorte(loteId: string | null, corte: string): boolean {
  const lote = loteId ? paraData(loteId) : null
  const limite = paraData(corte)
  return lote !== null && limite !== null && lote > limite
}

function dataDaPauta(loteId: string | null, hoje: Date): string {
  const bruto = (loteId ?? '').trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(bruto)) return bruto
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function avisoPublicacaoIgnorada(loteId: string | null, observacoes: string | null, hoje: Date = new Date()): string {
  const linha = `${MARCA_AVISO}${dataDaPauta(loteId, hoje)} — processo tratado na mão, não voltou para a fila.`
  const anteriores = (observacoes ?? '').split('\n').filter((l) => l.trim())
  if (anteriores.includes(linha)) return anteriores.join('\n')
  return [linha, ...anteriores.slice(0, AVISO_MAX_LINHAS - 1)].join('\n')
}

// Decidido com o Leonardo em 10/09/2026: publicação nova = análise nova (volta para
// 'pendente', como o Cowork), exceto quem o gestor assumiu na mão — esse só recebe o aviso.
// Nunca grava duplicata = true: o agente filtra duplicata = false e o CNJ sumiria da fila.
export function decidirGravacao(
  processo: ProcessoDaPauta,
  existente: LinhaExistente | undefined,
  contexto: { loteId: string | null; emailId: string },
  hoje: Date = new Date(),
): Gravacao {
  if (existente?.pje_status === PJE_STATUS_TRATADO_MANUAL) {
    return { tipo: 'avisar_tratado_manual', observacoes: avisoPublicacaoIgnorada(contexto.loteId, existente.observacoes, hoje) }
  }
  const dados: DadosProcesso = {
    numero_cnj: processo.numeroCnj,
    lote_id: contexto.loteId,
    numero_publicacao: String(processo.numeroPublicacao),
    fonte: 'gmail_api',
    email_id: contexto.emailId,
    pje_status: 'pendente',
    duplicata: false,
    observacoes: processo.observacoes,
  }
  // campo que a publicação não trouxe não apaga o que já estava no banco
  if (processo.vara) dados.vara = processo.vara
  if (processo.comarca) dados.comarca = processo.comarca
  if (processo.poloAtivo) dados.polo_ativo = processo.poloAtivo
  if (processo.poloPassivo) dados.polo_passivo = processo.poloPassivo
  if (processo.classeProcessual) dados.classe_processual = processo.classeProcessual
  if (processo.sistema) dados.sistema = processo.sistema
  return existente ? { tipo: 'atualizar', dados } : { tipo: 'inserir', dados }
}
```

Confirme antes que `lib/status.ts` não importa nada com `@/`: o Node não resolve o alias. Se importar, copie a constante `'tratado_manual'` para cá com um comentário apontando `lib/status.ts`.

- [ ] **Passo 4: Rodar e ver passar**

Esperado: `# fail 0`.

- [ ] **Passo 5: Commit**

```bash
git add lib/gmail/gravacao.ts lib/gmail/gravacao.test.ts
git commit -m "feat(gmail): regras de gravacao em processos e corte da ativacao"
```

---

## Tarefa 7: Configuração da ingestão

**Arquivos:**
- Criar: `lib/gmail/config.ts`
- Teste: `lib/gmail/config.test.ts`

Variáveis opcionais (defaults seguros; nenhuma precisa existir no Vercel nesta sessão):
- `GMAIL_INGESTAO_MODO`: `sombra` (padrão) ou `ativo`.
- `GMAIL_LOTE_CORTE`: `DD/MM/AAAA`, obrigatória para o modo ativo. Sem ela, fica em sombra.
- `GMAIL_REMETENTES`: lista separada por vírgula. Padrão: `intimacoes@exemplo-adv.example,oabmg@recortedigital.adv.br`.

- [ ] **Passo 1: Escrever o teste que falha**

`lib/gmail/config.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lerConfig, montarConsulta, remetenteAceito, REMETENTES_PADRAO } from './config.ts'

describe('modo da ingestão', () => {
  test('fica em sombra quando nada está configurado', () => {
    assert.equal(lerConfig({}).modo, 'sombra')
  })

  test('fica em sombra quando pede ativo sem data de corte', () => {
    assert.equal(lerConfig({ GMAIL_INGESTAO_MODO: 'ativo' }).modo, 'sombra')
  })

  test('ativa com modo ativo e corte em DD/MM/AAAA', () => {
    const config = lerConfig({ GMAIL_INGESTAO_MODO: 'ativo', GMAIL_LOTE_CORTE: '08/09/2026' })
    assert.equal(config.modo, 'ativo')
    assert.equal(config.loteCorte, '08/09/2026')
  })
})

describe('remetentes', () => {
  test('usa os dois remetentes padrão', () => {
    assert.deepEqual(lerConfig({}).remetentes, REMETENTES_PADRAO)
  })

  test('aceita lista própria, em minúsculas e sem espaços', () => {
    assert.deepEqual(lerConfig({ GMAIL_REMETENTES: ' A@x.com , b@y.com ' }).remetentes, ['a@x.com', 'b@y.com'])
  })

  test('aceita o From com nome e maiúsculas', () => {
    assert.equal(remetenteAceito('Intimações <Intimacoes@exemplo-adv.example>', REMETENTES_PADRAO), true)
  })

  test('recusa remetente de fora e From ausente', () => {
    assert.equal(remetenteAceito('alguem@outro.com', REMETENTES_PADRAO), false)
    assert.equal(remetenteAceito(null, REMETENTES_PADRAO), false)
  })
})

describe('busca no Gmail', () => {
  test('filtra remetentes, assunto do Recorte Digital e janela em dias', () => {
    assert.equal(
      montarConsulta(['a@x.com', 'b@y.com'], 7),
      'from:(a@x.com OR b@y.com) subject:"Recorte Digital" newer_than:7d',
    )
  })

  test('olha 7 dias normalmente e 30 na primeira sincronização', () => {
    const config = lerConfig({})
    assert.deepEqual([config.janelaDias, config.janelaPrimeiraSincronizacaoDias], [7, 30])
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning --test lib/gmail/config.test.ts
```
Esperado: FAIL.

- [ ] **Passo 3: Implementar**

`lib/gmail/config.ts`:
```ts
import { ehDataDeLote } from './gravacao.ts'

export type ModoIngestao = 'sombra' | 'ativo'

export const REMETENTES_PADRAO = ['intimacoes@exemplo-adv.example', 'oabmg@recortedigital.adv.br']

export interface ConfigIngestao {
  remetentes: string[]
  modo: ModoIngestao
  loteCorte: string | null
  janelaDias: number
  janelaPrimeiraSincronizacaoDias: number
}

export function lerConfig(env: Record<string, string | undefined>): ConfigIngestao {
  const remetentes = (env.GMAIL_REMETENTES ?? '')
    .split(',')
    .map((remetente) => remetente.trim().toLowerCase())
    .filter(Boolean)
  const loteCorte = (env.GMAIL_LOTE_CORTE ?? '').trim()
  // Ativo só com corte válido: sem ele, a ingestão regravaria as pautas que o Cowork já fez.
  const ativo = env.GMAIL_INGESTAO_MODO?.trim() === 'ativo' && ehDataDeLote(loteCorte)
  return {
    remetentes: remetentes.length > 0 ? remetentes : REMETENTES_PADRAO,
    modo: ativo ? 'ativo' : 'sombra',
    loteCorte: ativo ? loteCorte : null,
    janelaDias: 7,
    // a 1ª rodada recupera as pautas que o Cowork deixou para trás (decidido em 10/09/2026)
    janelaPrimeiraSincronizacaoDias: 30,
  }
}

export function montarConsulta(remetentes: string[], dias: number): string {
  return `from:(${remetentes.join(' OR ')}) subject:"Recorte Digital" newer_than:${dias}d`
}

export function remetenteAceito(cabecalhoFrom: string | null, remetentes: string[]): boolean {
  if (!cabecalhoFrom) return false
  const endereco = (/<([^>]+)>/.exec(cabecalhoFrom)?.[1] ?? cabecalhoFrom).trim().toLowerCase()
  return remetentes.includes(endereco)
}
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: `# fail 0`.

- [ ] **Passo 5: Commit**

```bash
git add lib/gmail/config.ts lib/gmail/config.test.ts
git commit -m "feat(gmail): configuracao da ingestao com modo sombra por padrao"
```

---

## Tarefa 8: Saúde da sincronização e alertas

**Arquivos:**
- Criar: `lib/gmail/alertas.ts`
- Teste: `lib/gmail/alertas.test.ts`

É o que resolve o "sucesso e falha ficam iguais" do Cowork. O cron roda a cada 15 min, então mais de 60 min sem uma rodada completa já é problema. A OAB manda em dia útil, e mais de 3 dias sem e-mail cobre o fim de semana.

- [ ] **Passo 1: Escrever o teste que falha**

`lib/gmail/alertas.test.ts`:
```ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { alertaDoUltimoEmail, alertasDoEmail, saudeDaSincronizacao, type EmailParaAlerta } from './alertas.ts'

const AGORA = new Date('2026-09-10T12:00:00Z')
const minutosAtras = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000).toISOString()

function email(campos: Partial<EmailParaAlerta> = {}): EmailParaAlerta {
  return {
    id: 'email-1',
    lote_id: '09/09/2026',
    total_cnj: 10,
    total_blocos: 12,
    total_fint: 2,
    total_declarado: 12,
    total_declarado_assunto: 12,
    parser_status: 'ok',
    aplicacao_status: 'sombra',
    erro: null,
    ...campos,
  }
}

describe('saúde da sincronização', () => {
  test('sem integração é perigo', () => {
    assert.equal(saudeDaSincronizacao(null, AGORA).nivel, 'danger')
  })

  test('desconectado pede para reconectar', () => {
    const saude = saudeDaSincronizacao({ status: 'desconectado', ultima_sincronizacao_ok_em: minutosAtras(5), ultimo_erro: null }, AGORA)
    assert.equal(saude.nivel, 'danger')
    assert.ok(saude.texto.includes('Reconectar'))
  })

  test('mais de 60 minutos sem rodada completa é perigo', () => {
    assert.equal(saudeDaSincronizacao({ status: 'conectado', ultima_sincronizacao_ok_em: minutosAtras(61), ultimo_erro: null }, AGORA).nivel, 'danger')
  })

  test('rodada recente sem erro está ok', () => {
    const saude = saudeDaSincronizacao({ status: 'conectado', ultima_sincronizacao_ok_em: minutosAtras(10), ultimo_erro: null }, AGORA)
    assert.deepEqual(saude, { nivel: 'ok', texto: 'Sincronizado há 10 min.' })
  })

  test('rodada recente com erro em alguma mensagem é atenção', () => {
    assert.equal(saudeDaSincronizacao({ status: 'conectado', ultima_sincronizacao_ok_em: minutosAtras(10), ultimo_erro: 'x' }, AGORA).nivel, 'warn')
  })
})

describe('último e-mail da OAB', () => {
  test('até 3 dias está ok', () => {
    assert.equal(alertaDoUltimoEmail(minutosAtras(2 * 24 * 60), AGORA).nivel, 'ok')
  })

  test('mais de 3 dias é atenção', () => {
    assert.equal(alertaDoUltimoEmail(minutosAtras(4 * 24 * 60), AGORA).nivel, 'warn')
  })
})

describe('alertas por e-mail', () => {
  test('e-mail que fechou não gera alerta', () => {
    assert.deepEqual(alertasDoEmail(email()), [])
  })

  test('parser com 0 CNJ é perigo e mostra quantos FINT', () => {
    const [alerta] = alertasDoEmail(email({ parser_status: 'sem_cnj', total_cnj: 0 }))
    assert.equal(alerta.nivel, 'danger')
    assert.equal(alerta.texto, 'Pauta 09/09/2026: nenhum CNJ lido (12 blocos, 2 FINT).')
  })

  test('blocos diferentes do total declarado é atenção', () => {
    const [alerta] = alertasDoEmail(email({ parser_status: 'divergente', total_blocos: 11 }))
    assert.equal(alerta.nivel, 'warn')
    assert.equal(alerta.texto, 'Pauta 09/09/2026: 11 blocos lidos, o e-mail declara 12 / 12.')
  })

  test('falha ao gravar nos processos é perigo', () => {
    const alertas = alertasDoEmail(email({ aplicacao_status: 'erro_aplicacao', erro: 'timeout' }))
    assert.equal(alertas[0]?.nivel, 'danger')
  })

  test('e-mail ilegível é perigo e não acusa divergência junto', () => {
    const alertas = alertasDoEmail(email({ parser_status: 'erro', erro: 'O e-mail não tem parte text/plain.', total_blocos: null }))
    assert.equal(alertas.length, 1)
  })
})
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
node --experimental-strip-types --no-warnings=ExperimentalWarning --test lib/gmail/alertas.test.ts
```
Esperado: FAIL.

- [ ] **Passo 3: Implementar**

`lib/gmail/alertas.ts`:
```ts
export type NivelAlerta = 'ok' | 'warn' | 'danger'

export interface Saude {
  nivel: NivelAlerta
  texto: string
}

export interface IntegracaoParaSaude {
  status: string
  ultima_sincronizacao_ok_em: string | null
  ultimo_erro: string | null
}

export interface EmailParaAlerta {
  id: string
  lote_id: string | null
  total_cnj: number | null
  total_blocos: number | null
  total_fint: number | null
  total_declarado: number | null
  total_declarado_assunto: number | null
  parser_status: string | null
  aplicacao_status: string | null
  erro: string | null
}

export interface Alerta {
  emailId: string
  nivel: Exclude<NivelAlerta, 'ok'>
  texto: string
}

// o cron roda a cada 15 min: uma hora sem rodada completa são quatro falhas seguidas
const MINUTOS_SEM_SINCRONIZAR = 60
// a OAB manda em dia útil; sexta de manhã até segunda de manhã são 3 dias
const DIAS_SEM_EMAIL = 3

function minutosDesde(iso: string, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000)
}

export function descreverTempo(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return `${horas} h`
  return `${Math.floor(horas / 24)} dias`
}

export function saudeDaSincronizacao(integracao: IntegracaoParaSaude | null, agora: Date): Saude {
  if (!integracao) return { nivel: 'danger', texto: 'Gmail não conectado.' }
  if (integracao.status !== 'conectado') {
    return { nivel: 'danger', texto: 'Gmail desconectado: senha trocada ou acesso revogado. Clique em Reconectar.' }
  }
  if (!integracao.ultima_sincronizacao_ok_em) {
    return { nivel: 'warn', texto: 'Conectado, aguardando a primeira sincronização.' }
  }
  const minutos = minutosDesde(integracao.ultima_sincronizacao_ok_em, agora)
  if (minutos > MINUTOS_SEM_SINCRONIZAR) return { nivel: 'danger', texto: `Sem sincronizar há ${descreverTempo(minutos)}.` }
  if (integracao.ultimo_erro) {
    return { nivel: 'warn', texto: `Sincronizou há ${descreverTempo(minutos)}, com erro: ${integracao.ultimo_erro}` }
  }
  return { nivel: 'ok', texto: `Sincronizado há ${descreverTempo(minutos)}.` }
}

export function alertaDoUltimoEmail(dataRecebimento: string | null, agora: Date): Saude {
  if (!dataRecebimento) return { nivel: 'warn', texto: 'Nenhum e-mail da OAB lido ainda.' }
  const minutos = minutosDesde(dataRecebimento, agora)
  return {
    nivel: minutos > DIAS_SEM_EMAIL * 24 * 60 ? 'warn' : 'ok',
    texto: `Último e-mail da OAB há ${descreverTempo(minutos)}.`,
  }
}

export function alertasDoEmail(email: EmailParaAlerta): Alerta[] {
  const pauta = email.lote_id ? `Pauta ${email.lote_id}` : 'E-mail sem data de pauta'
  const alertas: Alerta[] = []
  const alertar = (nivel: Alerta['nivel'], texto: string) => alertas.push({ emailId: email.id, nivel, texto: `${pauta}: ${texto}` })

  if (email.parser_status === 'erro') {
    alertar('danger', email.erro ?? 'não foi possível ler o e-mail.')
    return alertas
  }
  if (email.parser_status === 'sem_cnj') {
    alertar('danger', `nenhum CNJ lido (${email.total_blocos ?? 0} blocos, ${email.total_fint ?? 0} FINT).`)
  }
  const blocos = email.total_blocos ?? 0
  const declarados = [email.total_declarado, email.total_declarado_assunto]
  if (declarados.some((declarado) => declarado !== blocos)) {
    alertar('warn', `${blocos} blocos lidos, o e-mail declara ${declarados.map((d) => d ?? '?').join(' / ')}.`)
  }
  if (email.aplicacao_status === 'erro_aplicacao') {
    alertar('danger', `falhou ao gravar nos processos (${email.erro ?? 'sem detalhe'}); a próxima sincronização tenta de novo.`)
  }
  return alertas
}
```

- [ ] **Passo 4: Rodar e ver passar; rodar a suíte toda**

```bash
npm test
```
Esperado: todos os arquivos de `lib/**/*.test.ts` com `# fail 0`.

- [ ] **Passo 5: Commit**

```bash
git add lib/gmail/alertas.ts lib/gmail/alertas.test.ts
git commit -m "feat(gmail): saude da sincronizacao e alertas por pauta"
```

**Revisão da Fase B:** despache `superpowers:code-reviewer` com o escopo "Tarefas 2 a 8 do plano `docs/superpowers/plans/2026-09-10-ingestao-gmail-api.md`". Corrija o que for crítico antes da Fase C.

---

## Tarefa 9: Cliente do Google, conexão e sincronização (servidor)

**Arquivos:**
- Criar: `lib/gmail/google.ts`, `lib/gmail/integracao.ts`, `lib/gmail/sincronizar.ts`

Sem teste unitário: o `tests.md` do Leonardo pede mock na fronteira HTTP (msw), e msw seria dependência nova. A validação é a integração real (Tarefas 15 e 16). Registre isso em `docs/divida-tecnica.md` na Tarefa 18. Estes arquivos rodam só no bundle do Next: importe com `@/` e sem extensão.

- [ ] **Passo 1: `lib/gmail/google.ts`**

```ts
import type { GmailParte } from '@/lib/gmail/mime'

const URL_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth'
const URL_TOKEN = 'https://oauth2.googleapis.com/token'
const URL_GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export const ESCOPO_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly'

export class AcessoRevogadoError extends Error {
  constructor() {
    super('O Google recusou o acesso (invalid_grant): senha trocada ou acesso revogado. Reconecte o Gmail.')
    this.name = 'AcessoRevogadoError'
  }
}

export class PermissaoNegadaError extends Error {
  constructor() {
    super('A permissão de leitura do Gmail não foi marcada na tela do Google.')
    this.name = 'PermissaoNegadaError'
  }
}

interface RespostaToken {
  access_token?: string
  refresh_token?: string
  scope?: string
  error?: string
}

export interface MensagemGmail {
  id: string
  internalDate: string
  payload: GmailParte
}

function credenciais(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET precisam estar configuradas.')
  return { clientId, clientSecret }
}

export function urlDeAutorizacao(redirectUri: string, state: string): string {
  const parametros = new URLSearchParams({
    client_id: credenciais().clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPO_GMAIL,
    // offline + consent: é o que faz o Google devolver refresh token toda vez
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${URL_AUTORIZACAO}?${parametros.toString()}`
}

async function pedirToken(campos: Record<string, string>): Promise<RespostaToken> {
  const { clientId, clientSecret } = credenciais()
  const resposta = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...campos, client_id: clientId, client_secret: clientSecret }),
    cache: 'no-store',
  })
  const corpo = (await resposta.json()) as RespostaToken
  if (resposta.ok) return corpo
  if (corpo.error === 'invalid_grant') throw new AcessoRevogadoError()
  throw new Error(`O Google recusou o pedido de token (${corpo.error ?? resposta.status}).`)
}

export async function trocarCodigo(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string }> {
  const corpo = await pedirToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  // a tela do Google deixa desmarcar o escopo; sem ele o token não lê e-mail nenhum
  if (!corpo.scope?.split(' ').includes(ESCOPO_GMAIL)) throw new PermissaoNegadaError()
  if (!corpo.access_token || !corpo.refresh_token) throw new Error('O Google não devolveu o refresh token. Conecte de novo.')
  return { accessToken: corpo.access_token, refreshToken: corpo.refresh_token }
}

export async function renovarAccessToken(refreshToken: string): Promise<string> {
  const corpo = await pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken })
  if (!corpo.access_token) throw new Error('O Google não devolveu access token.')
  return corpo.access_token
}

async function gmail<T>(accessToken: string, caminho: string): Promise<T> {
  const resposta = await fetch(`${URL_GMAIL}${caminho}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!resposta.ok) throw new Error(`A API do Gmail respondeu ${resposta.status} em ${caminho.split('?')[0]}.`)
  return (await resposta.json()) as T
}

export async function lerEmailDoPerfil(accessToken: string): Promise<string> {
  const perfil = await gmail<{ emailAddress: string }>(accessToken, '/profile')
  return perfil.emailAddress
}

export async function listarIdsDeMensagens(accessToken: string, consulta: string, maxPaginas = 5): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const parametros = new URLSearchParams({ q: consulta, maxResults: '100' })
    if (pageToken) parametros.set('pageToken', pageToken)
    const resposta = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
      accessToken,
      `/messages?${parametros.toString()}`,
    )
    ids.push(...(resposta.messages ?? []).map((mensagem) => mensagem.id))
    pageToken = resposta.nextPageToken
    if (!pageToken) break
  }
  return ids
}

export async function lerMensagem(accessToken: string, id: string): Promise<MensagemGmail> {
  return gmail<MensagemGmail>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`)
}
```

- [ ] **Passo 2: `lib/gmail/integracao.ts`**

```ts
// Só server-side (usa o service role). Nunca devolve o token para quem chama.
import { createAdminClient } from '@/lib/supabase/admin'
import { cifrar } from '@/lib/gmail/cripto'

export function chaveDoToken(): string {
  const chave = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  if (!chave) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY não configurada.')
  return chave
}

export async function salvarConexao(dados: { email: string; refreshToken: string; usuarioId: string }): Promise<void> {
  const supabase = createAdminClient()
  const agora = new Date().toISOString()
  const { error } = await supabase.from('integracao_gmail').upsert({
    id: 1,
    email_conectado: dados.email,
    refresh_token_cifrado: cifrar(dados.refreshToken, chaveDoToken()),
    status: 'conectado',
    ultimo_erro: null,
    ultimo_erro_em: null,
    conectado_por: dados.usuarioId,
    conectado_em: agora,
    atualizado_em: agora,
  })
  if (error) throw new Error(`Erro ao salvar a conexão do Gmail: ${error.message}`)
}
```

- [ ] **Passo 3: `lib/gmail/sincronizar.ts`**

```ts
// Uma rodada da ingestão: renova o token, lista as pautas no Gmail, lê as mensagens
// novas, roda o parser e grava. Em modo sombra para em emails_recebidos; em modo
// ativo aplica em processos. Chamado pelo pg_cron (via rota) e pelo botão do painel.
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { decifrar } from '@/lib/gmail/cripto'
import { lerConfig, montarConsulta, remetenteAceito, type ConfigIngestao, type ModoIngestao } from '@/lib/gmail/config'
import { AcessoRevogadoError, lerMensagem, listarIdsDeMensagens, renovarAccessToken } from '@/lib/gmail/google'
import { decidirGravacao, loteDepoisDoCorte, type Gravacao } from '@/lib/gmail/gravacao'
import { chaveDoToken } from '@/lib/gmail/integracao'
import { extrairTextoPlano, lerHeader } from '@/lib/gmail/mime'
import { parsearPauta, VERSAO_PARSER, type ResultadoParser } from '@/lib/gmail/parser'

type Admin = ReturnType<typeof createAdminClient>

// cabe folgado em 60 s: cada mensagem é um GET no Gmail e poucas escritas no banco
const MAX_MENSAGENS_POR_RODADA = 25
const MAX_REPARACOES_POR_RODADA = 5

export interface ResumoSincronizacao {
  status: 'ok' | 'nao_conectado' | 'desconectado' | 'erro'
  modo: ModoIngestao
  encontrados: number
  novos: number
  ignoradosRemetente: number
  aplicados: number
  erros: string[]
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export async function sincronizarGmail(opcoes: { aplicarEmailIds?: string[] } = {}): Promise<ResumoSincronizacao> {
  const config = lerConfig(process.env)
  const supabase = createAdminClient()
  const resumo: ResumoSincronizacao = {
    status: 'ok',
    modo: config.modo,
    encontrados: 0,
    novos: 0,
    ignoradosRemetente: 0,
    aplicados: 0,
    erros: [],
  }

  const { data: integracao, error: erroIntegracao } = await supabase
    .from('integracao_gmail')
    .select('refresh_token_cifrado, status, ultima_sincronizacao_ok_em')
    .eq('id', 1)
    .maybeSingle()
  if (erroIntegracao) throw new Error(`Erro ao ler a integração do Gmail: ${erroIntegracao.message}`)
  if (!integracao) return { ...resumo, status: 'nao_conectado' }
  if (integracao.status !== 'conectado') return { ...resumo, status: 'desconectado' }

  const inicio = new Date().toISOString()
  try {
    const accessToken = await renovarAccessToken(decifrar(integracao.refresh_token_cifrado, chaveDoToken()))

    if (config.modo === 'ativo') {
      resumo.aplicados += await repararAplicacoes(supabase, resumo)
    }

    const dias = integracao.ultima_sincronizacao_ok_em ? config.janelaDias : config.janelaPrimeiraSincronizacaoDias
    const ids = await listarIdsDeMensagens(accessToken, montarConsulta(config.remetentes, dias))
    resumo.encontrados = ids.length
    const jaSalvos = await idsJaSalvos(supabase, ids)
    // o Gmail lista da mais nova para a mais antiga; gravar na ordem das pautas
    const novos = ids.filter((id) => !jaSalvos.has(id)).reverse().slice(0, MAX_MENSAGENS_POR_RODADA)
    for (const id of novos) {
      try {
        resumo.aplicados += await processarMensagem(supabase, accessToken, id, config, resumo)
      } catch (erro) {
        resumo.erros.push(`Mensagem ${id}: ${mensagemDe(erro)}`)
      }
    }

    const pedidos = opcoes.aplicarEmailIds ?? []
    if (pedidos.length > 0 && config.modo !== 'ativo') {
      resumo.erros.push('aplicar_email_ids ignorado: a ingestão está em modo sombra.')
    }
    if (config.modo === 'ativo') {
      for (const emailId of pedidos) {
        try {
          resumo.aplicados += await aplicarEmail(supabase, emailId)
        } catch (erro) {
          resumo.erros.push(`E-mail ${emailId}: ${mensagemDe(erro)}`)
        }
      }
    }

    const temErro = resumo.erros.length > 0
    await supabase
      .from('integracao_gmail')
      .update({
        ultima_sincronizacao_em: inicio,
        ultima_sincronizacao_ok_em: inicio,
        ultimo_erro: temErro ? resumo.erros.join(' | ').slice(0, 1000) : null,
        ultimo_erro_em: temErro ? inicio : null,
        atualizado_em: inicio,
      })
      .eq('id', 1)
    return resumo
  } catch (erro) {
    const revogado = erro instanceof AcessoRevogadoError
    await supabase
      .from('integracao_gmail')
      .update({
        ...(revogado ? { status: 'desconectado' } : {}),
        ultima_sincronizacao_em: inicio,
        ultimo_erro: mensagemDe(erro).slice(0, 1000),
        ultimo_erro_em: inicio,
        atualizado_em: inicio,
      })
      .eq('id', 1)
    return { ...resumo, status: revogado ? 'desconectado' : 'erro', erros: [...resumo.erros, mensagemDe(erro)] }
  }
}

async function idsJaSalvos(supabase: Admin, ids: string[]): Promise<Set<string>> {
  const salvos = new Set<string>()
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const { data, error } = await supabase
      .from('emails_recebidos')
      .select('gmail_message_id')
      .in('gmail_message_id', ids.slice(inicio, inicio + 100))
    if (error) throw new Error(`Erro ao conferir mensagens já lidas: ${error.message}`)
    for (const linha of data ?? []) if (linha.gmail_message_id) salvos.add(linha.gmail_message_id)
  }
  return salvos
}

async function processarMensagem(
  supabase: Admin,
  accessToken: string,
  id: string,
  config: ConfigIngestao,
  resumo: ResumoSincronizacao,
): Promise<number> {
  const mensagem = await lerMensagem(accessToken, id)
  const remetente = lerHeader(mensagem.payload, 'From')
  // a busca já filtra o remetente; conferir de novo protege contra o from: do Gmail casar parcial
  if (!remetenteAceito(remetente, config.remetentes)) {
    resumo.ignoradosRemetente++
    return 0
  }
  const assunto = lerHeader(mensagem.payload, 'Subject') ?? ''
  const texto = extrairTextoPlano(mensagem.payload)
  const resultado: ResultadoParser | null = texto ? parsearPauta(assunto, texto.texto) : null
  const aplicacao =
    config.modo === 'sombra'
      ? 'sombra'
      : loteDepoisDoCorte(resultado?.loteId ?? null, config.loteCorte ?? '')
        ? 'pendente'
        : 'antes_do_corte'

  const { data: salvo, error } = await supabase
    .from('emails_recebidos')
    .insert({
      remetente: remetente ?? '',
      assunto,
      data_recebimento: new Date(Number(mensagem.internalDate)).toISOString(),
      data_processamento: new Date().toISOString(),
      gmail_message_id: id,
      corpo_texto: texto?.texto ?? null,
      lote_id: resultado?.loteId ?? null,
      total_cnj: resultado?.processos.length ?? 0,
      total_blocos: resultado?.totalBlocos ?? null,
      total_fint: resultado?.totalFint ?? null,
      total_validos: resultado?.totalValidos ?? null,
      total_declarado: resultado?.totalDeclaradoCorpo ?? null,
      total_declarado_assunto: resultado?.totalDeclaradoAssunto ?? null,
      parser_status: resultado?.status ?? 'erro',
      parser_versao: VERSAO_PARSER,
      parser_resultado: resultado ? (resultado as unknown as Json) : null,
      modo: config.modo,
      aplicacao_status: aplicacao,
      erro: texto ? null : 'O e-mail não tem parte text/plain.',
    })
    .select('id')
    .single()
  if (error) {
    // outra rodada salvou esta mensagem ao mesmo tempo (índice único em gmail_message_id)
    if (error.code === '23505') return 0
    throw new Error(`Erro ao salvar o e-mail: ${error.message}`)
  }
  resumo.novos++
  return aplicacao === 'pendente' ? aplicarEmail(supabase, salvo.id) : 0
}

// Salvar o e-mail e gravar os processos são passos separados. Se o segundo falhar, o
// e-mail já está no banco e a busca nunca mais o traz como novo: sem esta reparação,
// a pauta ficaria para trás em silêncio.
async function repararAplicacoes(supabase: Admin, resumo: ResumoSincronizacao): Promise<number> {
  const { data, error } = await supabase
    .from('emails_recebidos')
    .select('id')
    .eq('modo', 'ativo')
    .in('aplicacao_status', ['pendente', 'erro_aplicacao'])
    .order('data_recebimento', { ascending: true })
    .limit(MAX_REPARACOES_POR_RODADA)
  if (error) throw new Error(`Erro ao buscar pautas por reaplicar: ${error.message}`)
  let aplicados = 0
  for (const { id } of data ?? []) {
    try {
      aplicados += await aplicarEmail(supabase, id)
    } catch (erro) {
      resumo.erros.push(`E-mail ${id}: ${mensagemDe(erro)}`)
    }
  }
  return aplicados
}

async function aplicarEmail(supabase: Admin, emailId: string): Promise<number> {
  const { data: email, error } = await supabase
    .from('emails_recebidos')
    .select('id, lote_id, parser_resultado')
    .eq('id', emailId)
    .single()
  if (error || !email) throw new Error(`E-mail ${emailId} não encontrado.`)
  const processos = (email.parser_resultado as unknown as ResultadoParser | null)?.processos ?? []

  try {
    if (processos.length > 0) {
      const { data: existentes, error: erroExistentes } = await supabase
        .from('processos')
        .select('numero_cnj, pje_status, observacoes')
        .in('numero_cnj', processos.map((processo) => processo.numeroCnj))
      if (erroExistentes) throw new Error(erroExistentes.message)
      const porCnj = new Map((existentes ?? []).map((linha) => [linha.numero_cnj, linha]))
      for (const processo of processos) {
        const gravacao = decidirGravacao(processo, porCnj.get(processo.numeroCnj), { loteId: email.lote_id, emailId })
        await executarGravacao(supabase, processo.numeroCnj, gravacao)
      }
    }
    await supabase
      .from('emails_recebidos')
      .update({ aplicacao_status: 'aplicado', aplicado_em: new Date().toISOString(), erro: null })
      .eq('id', emailId)
    return processos.length
  } catch (erro) {
    await supabase
      .from('emails_recebidos')
      .update({ aplicacao_status: 'erro_aplicacao', erro: mensagemDe(erro).slice(0, 1000) })
      .eq('id', emailId)
    throw erro
  }
}

async function executarGravacao(supabase: Admin, numeroCnj: string, gravacao: Gravacao): Promise<void> {
  if (gravacao.tipo === 'avisar_tratado_manual') {
    const { error } = await supabase.from('processos').update({ observacoes: gravacao.observacoes }).eq('numero_cnj', numeroCnj)
    if (error) throw new Error(`${numeroCnj}: ${error.message}`)
    return
  }
  if (gravacao.tipo === 'inserir') {
    const { error } = await supabase.from('processos').insert(gravacao.dados)
    if (!error) return
    if (error.code !== '23505') throw new Error(`${numeroCnj}: ${error.message}`)
    // o CNJ entrou entre a leitura e a gravação (o Cowork ainda roda na transição): atualiza
  }
  const { error } = await supabase.from('processos').update(gravacao.dados).eq('numero_cnj', numeroCnj)
  if (error) throw new Error(`${numeroCnj}: ${error.message}`)
}
```

- [ ] **Passo 4: Conferir tipos e lint**

```bash
npx tsc --noEmit && npm run lint
```
Esperado: sem erro. Se o tipo gerado de `emails_recebidos`/`integracao_gmail` não bater com algum campo acima, confira a Tarefa 1 (tipos regerados) antes de mexer no código.

- [ ] **Passo 5: Commit**

```bash
git add lib/gmail/google.ts lib/gmail/integracao.ts lib/gmail/sincronizar.ts
git commit -m "feat(gmail): cliente REST do Google e rodada de sincronizacao"
```

---

## Tarefa 10: Rotas do OAuth, rota de sincronização e rotas públicas

**Arquivos:**
- Criar: `app/api/gmail/conectar/route.ts`, `app/api/gmail/callback/route.ts`, `app/api/gmail/sincronizar/route.ts`
- Modificar: `middleware.ts:4`

Arquivo `route.ts` só pode exportar handlers e config de segmento. Constante compartilhada fica em `lib/gmail/seguranca.ts`.

- [ ] **Passo 1: Rotas públicas no middleware**

Em `middleware.ts`, troque a linha 4 por:
```ts
// /api/gmail/sincronizar é chamada pelo pg_cron, sem sessão: a rota se protege com o Bearer.
// /privacidade é a política exigida pelo Google para publicar o app OAuth.
const ROTAS_PUBLICAS = ['/login', '/esqueci-senha', '/redefinir-senha', '/convite', '/auth/confirm', '/privacidade', '/api/gmail/sincronizar']
```
`/api/gmail/conectar` e `/api/gmail/callback` **não** entram: quem conecta está logado no painel.

- [ ] **Passo 2: `app/api/gmail/conectar/route.ts`**

```ts
import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/auth/base-url'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'
import { urlDeAutorizacao } from '@/lib/gmail/google'
import { COOKIE_STATE_GMAIL, COOKIE_STATE_PATH } from '@/lib/gmail/seguranca'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const state = randomBytes(32).toString('hex')
  const resposta = NextResponse.redirect(urlDeAutorizacao(`${await getBaseUrl()}/api/gmail/callback`, state))
  // lax: o retorno do Google é navegação de topo (GET), então o cookie volta junto
  resposta.cookies.set(COOKIE_STATE_GMAIL, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_STATE_PATH,
    maxAge: 600,
  })
  return resposta
}
```

- [ ] **Passo 3: `app/api/gmail/callback/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { getBaseUrl } from '@/lib/auth/base-url'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'
import { lerEmailDoPerfil, PermissaoNegadaError, trocarCodigo } from '@/lib/gmail/google'
import { salvarConexao } from '@/lib/gmail/integracao'
import { COOKIE_STATE_GMAIL, COOKIE_STATE_PATH, iguaisEmTempoConstante } from '@/lib/gmail/seguranca'

export const dynamic = 'force-dynamic'

async function concluirConexao(code: string, redirectUri: string, usuarioId: string): Promise<string> {
  try {
    const { accessToken, refreshToken } = await trocarCodigo(code, redirectUri)
    const email = await lerEmailDoPerfil(accessToken)
    await salvarConexao({ email, refreshToken, usuarioId })
    return 'conectado'
  } catch (erro) {
    if (erro instanceof PermissaoNegadaError) return 'sem_permissao'
    // só a mensagem: o objeto de erro pode carregar o corpo da resposta do Google
    console.error('[gmail/callback]', erro instanceof Error ? erro.message : 'erro desconhecido')
    return 'erro'
  }
}

export async function GET(request: NextRequest) {
  const base = await getBaseUrl()
  const gestor = await requireGestorApi()
  const parametros = request.nextUrl.searchParams
  const code = parametros.get('code')
  const state = parametros.get('state')
  const stateEsperado = request.cookies.get(COOKIE_STATE_GMAIL)?.value

  let resultado: string
  if (!gestor) resultado = 'nao_autorizado'
  else if (parametros.get('error')) resultado = 'recusado'
  else if (!code || !state || !stateEsperado || !iguaisEmTempoConstante(state, stateEsperado)) resultado = 'state_invalido'
  else resultado = await concluirConexao(code, `${base}/api/gmail/callback`, gestor.id)

  const resposta = NextResponse.redirect(`${base}/configuracoes?gmail=${resultado}`)
  resposta.cookies.set(COOKIE_STATE_GMAIL, '', { path: COOKIE_STATE_PATH, maxAge: 0 })
  return resposta
}
```

- [ ] **Passo 4: `app/api/gmail/sincronizar/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { sincronizarGmail } from '@/lib/gmail/sincronizar'
import { bearerValido } from '@/lib/gmail/seguranca'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (!bearerValido(request.headers.get('authorization'), process.env.GMAIL_SYNC_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // O pg_cron manda {}. aplicar_email_ids só vale em modo ativo: é como a sessão de
  // ativação aplica, com o ok do Leonardo, pautas lidas em sombra.
  let aplicarEmailIds: string[] = []
  try {
    const corpo = (await request.json()) as { aplicar_email_ids?: unknown }
    if (Array.isArray(corpo.aplicar_email_ids)) {
      aplicarEmailIds = corpo.aplicar_email_ids.filter((id): id is string => typeof id === 'string')
    }
  } catch {
    // corpo vazio ou inválido: rodada normal
  }

  try {
    const resumo = await sincronizarGmail({ aplicarEmailIds })
    return NextResponse.json(resumo, { status: resumo.status === 'erro' ? 500 : 200 })
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : 'erro desconhecido' }, { status: 500 })
  }
}
```

- [ ] **Passo 5: Conferir localmente**

Suba o dev server (`preview_start`, configuração do `npm run dev` na porta 3000) e, sem sessão:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/gmail/sincronizar
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/gmail/conectar
```
Esperado:
- a sincronização devolve `401` (JSON, sem redirecionar para `/login`);
- o conectar devolve `307` para `/login` (o middleware barra quem não tem sessão).

Depois, com o Bearer lido do `.env.local` e sem imprimir o valor, rode `.fixtures-privadas/chamar-sincronizar.mjs` (conteúdo abaixo) apontando para `http://localhost:3000`. Esperado: `200 {"status":"nao_conectado",...}`.

`.fixtures-privadas/chamar-sincronizar.mjs` (fora do git; serve também para as Tarefas 16 e 17):
```js
// Uso: node .fixtures-privadas/chamar-sincronizar.mjs <base-url> [corpo-json]
// Lê o GMAIL_SYNC_SECRET do .env.local e não imprime o valor.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((linha) => /^[A-Z0-9_]+=/.test(linha))
    .map((linha) => [linha.slice(0, linha.indexOf('=')), linha.slice(linha.indexOf('=') + 1)]),
)
const [base = 'http://localhost:3000', corpo = '{}'] = process.argv.slice(2)
const resposta = await fetch(`${base}/api/gmail/sincronizar`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.GMAIL_SYNC_SECRET}`, 'Content-Type': 'application/json' },
  body: corpo,
})
console.log(resposta.status, await resposta.text())
```

- [ ] **Passo 6: Commit**

```bash
git add middleware.ts app/api/gmail
git commit -m "feat(gmail): rotas de conexao OAuth e de sincronizacao com Bearer"
```

---

## Tarefa 11: Página de política de privacidade

**Arquivos:**
- Criar: `app/privacidade/page.tsx`

O endereço já está cadastrado no Google. A página é pública, simples e sem cabeçalho do painel.

- [ ] **Passo 1: Criar a página**

```tsx
export const metadata = { title: 'Política de privacidade — Controladoria Exemplo' }

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 space-y-6 text-sm text-text-secondary">
      <h1 className="text-xl font-semibold text-text">Política de privacidade</h1>
      <p>
        O painel da Controladoria Exemplo Advogados é de uso interno do escritório. Esta
        página explica o que ele faz com a conta Google conectada a ele.
      </p>
      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">O que é lido</h2>
        <p>
          Com a permissão de <strong>somente leitura do Gmail</strong>, o painel busca apenas os e-mails
          do serviço Recorte Digital da OAB/MG (a pauta diária de publicações) e extrai deles os números
          dos processos e os dados de cabeçalho da publicação. Nenhum e-mail é enviado, apagado, marcado
          como lido ou alterado.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Onde fica guardado</h2>
        <p>
          O texto desses e-mails e os dados extraídos ficam no banco de dados do painel, acessível só à
          equipe do escritório. A credencial de acesso ao Gmail é guardada cifrada e nunca é mostrada na
          tela.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Compartilhamento</h2>
        <p>
          Os dados não são vendidos nem compartilhados com terceiros. O uso e a transferência de
          informações recebidas das APIs do Google obedecem à Política de Dados do Usuário dos Serviços
          de API do Google, incluindo os requisitos de Uso Limitado.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-medium text-text">Como revogar</h2>
        <p>
          O acesso pode ser retirado a qualquer momento em myaccount.google.com/permissions. Dúvidas:
          intimacoes@exemplo-adv.example.
        </p>
      </section>
    </main>
  )
}
```

- [ ] **Passo 2: Conferir sem sessão**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/privacidade
```
Esperado: `200` (sem redirecionar para `/login`).

- [ ] **Passo 3: Commit**

```bash
git add app/privacidade/page.tsx
git commit -m "feat: pagina publica de politica de privacidade exigida pelo Google"
```

---

## Tarefa 12: Indicadores e conexão no painel

**Arquivos:**
- Criar: `lib/gmail/painel.ts`, `components/gmail/indicadores-gmail.tsx`, `app/configuracoes/ConexaoGmail.tsx`, `app/configuracoes/SincronizarGmailButton.tsx`
- Modificar: `app/configuracoes/actions.ts`, `app/configuracoes/page.tsx`, `app/dashboard/page.tsx`, `app/dashboard/EmailLoteList.tsx`

Visual: siga os tokens que já existem (`bg-surface`, `border-border`, `text-text-secondary`, `bg-ok`/`bg-warn`/`bg-danger` e os `-subtle`). Nada de cor nova. Classes do Tailwind sempre como string inteira (o Tailwind lê o código-fonte; ver o comentário em `app/entradas/[data]/ProcessosList.tsx:50`).

- [ ] **Passo 1: `lib/gmail/painel.ts`**

```ts
// Dados dos indicadores. Nunca seleciona refresh_token_cifrado.
import { createAdminClient } from '@/lib/supabase/admin'
import type { EmailParaAlerta } from '@/lib/gmail/alertas'
import { lerConfig, type ModoIngestao } from '@/lib/gmail/config'

export interface IntegracaoVisivel {
  email_conectado: string
  status: string
  ultima_sincronizacao_em: string | null
  ultima_sincronizacao_ok_em: string | null
  ultimo_erro: string | null
}

export interface EmailRecente extends EmailParaAlerta {
  assunto: string | null
  remetente: string
  data_recebimento: string
  modo: string | null
}

export interface DadosPainelGmail {
  integracao: IntegracaoVisivel | null
  recentes: EmailRecente[]
  modo: ModoIngestao
  // calculado aqui, e não no render, para o componente continuar puro
  agora: string
}

export async function carregarPainelGmail(): Promise<DadosPainelGmail> {
  const supabase = createAdminClient()
  const [integracaoRes, emailsRes] = await Promise.all([
    supabase
      .from('integracao_gmail')
      .select('email_conectado, status, ultima_sincronizacao_em, ultima_sincronizacao_ok_em, ultimo_erro')
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('emails_recebidos')
      .select('id, assunto, remetente, data_recebimento, lote_id, total_cnj, total_blocos, total_fint, total_declarado, total_declarado_assunto, parser_status, aplicacao_status, erro, modo')
      .not('gmail_message_id', 'is', null)
      .order('data_recebimento', { ascending: false })
      .limit(10),
  ])
  if (integracaoRes.error) throw new Error(integracaoRes.error.message)
  if (emailsRes.error) throw new Error(emailsRes.error.message)
  return {
    integracao: integracaoRes.data,
    recentes: emailsRes.data ?? [],
    modo: lerConfig(process.env).modo,
    agora: new Date().toISOString(),
  }
}
```

- [ ] **Passo 2: `components/gmail/indicadores-gmail.tsx`** (Server Component)

```tsx
import Link from 'next/link'
import { alertaDoUltimoEmail, alertasDoEmail, saudeDaSincronizacao, type NivelAlerta } from '@/lib/gmail/alertas'
import type { DadosPainelGmail } from '@/lib/gmail/painel'

const PONTO: Record<NivelAlerta, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

const FAIXA: Record<Exclude<NivelAlerta, 'ok'>, string> = {
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
}

function Indicador({ nivel, texto }: { nivel: NivelAlerta; texto: string }) {
  return (
    <li className="flex items-center gap-2 text-text-secondary">
      <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[nivel]}`} aria-hidden="true" />
      {texto}
    </li>
  )
}

export default function IndicadoresGmail({ dados, detalhado = false }: { dados: DadosPainelGmail; detalhado?: boolean }) {
  const agora = new Date(dados.agora)
  const conexao: { nivel: NivelAlerta; texto: string } = !dados.integracao
    ? { nivel: 'danger', texto: 'Nenhuma conta do Gmail conectada' }
    : dados.integracao.status === 'conectado'
      ? { nivel: 'ok', texto: `Conectado como ${dados.integracao.email_conectado}` }
      : { nivel: 'danger', texto: `Desconectado (era ${dados.integracao.email_conectado})` }
  const sincronizacao = saudeDaSincronizacao(dados.integracao, agora)
  const ultimoEmail = alertaDoUltimoEmail(dados.recentes[0]?.data_recebimento ?? null, agora)
  const alertas = dados.recentes.flatMap(alertasDoEmail)

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-medium text-text">Pauta da OAB pelo Gmail</h2>
        <span className="rounded bg-border-subtle px-2 py-0.5 text-xs text-text-secondary">
          {dados.modo === 'sombra' ? 'Modo sombra: lê e registra, não mexe nos processos' : 'Modo ativo'}
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        <Indicador nivel={conexao.nivel} texto={conexao.texto} />
        <Indicador nivel={sincronizacao.nivel} texto={sincronizacao.texto} />
        <Indicador nivel={ultimoEmail.nivel} texto={ultimoEmail.texto} />
      </ul>
      {alertas.length > 0 && (
        <ul className="space-y-1">
          {alertas.map((alerta, indice) => (
            <li key={`${alerta.emailId}-${indice}`}>
              <Link href={`/emails/${alerta.emailId}`} className={`block rounded px-3 py-2 text-xs hover:underline ${FAIXA[alerta.nivel]}`}>
                {alerta.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!detalhado && (
        <Link href="/configuracoes" className="inline-block text-xs text-text-tertiary hover:text-text-secondary">
          Detalhes da integração
        </Link>
      )}
    </section>
  )
}
```

- [ ] **Passo 3: Server action "Sincronizar agora"**

No fim de `app/configuracoes/actions.ts` (o arquivo já tem `'use server'`, `revalidatePath` e `requireGestor`), acrescente o import `import { sincronizarGmail } from '@/lib/gmail/sincronizar'` junto dos outros imports, e depois:
```ts
export type SincronizarGmailState = { mensagem?: string; erro?: string }

const TEXTO_STATUS_SINCRONIZACAO: Record<string, string> = {
  nao_conectado: 'Nenhuma conta do Gmail conectada.',
  desconectado: 'O Gmail está desconectado. Clique em Reconectar.',
  erro: 'A sincronização falhou.',
}

export async function sincronizarGmailAgora(): Promise<SincronizarGmailState> {
  await requireGestor()
  const resumo = await sincronizarGmail()
  revalidatePath('/configuracoes')
  revalidatePath('/dashboard')
  if (resumo.status !== 'ok') {
    return { erro: [TEXTO_STATUS_SINCRONIZACAO[resumo.status], ...resumo.erros].filter(Boolean).join(' ') }
  }
  const novos = `${resumo.novos} e-mail(s) novo(s) lido(s)`
  return resumo.erros.length > 0 ? { erro: `${novos}, com erro: ${resumo.erros.join(' | ')}` } : { mensagem: `${novos}.` }
}
```

- [ ] **Passo 4: `app/configuracoes/SincronizarGmailButton.tsx`**

```tsx
'use client'
// precisa de useTransition para mostrar "Sincronizando…" e o resultado sem recarregar a página

import { useState, useTransition } from 'react'
import { sincronizarGmailAgora, type SincronizarGmailState } from './actions'

export default function SincronizarGmailButton() {
  const [pendente, iniciar] = useTransition()
  const [estado, setEstado] = useState<SincronizarGmailState>({})

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await sincronizarGmailAgora()))}
        className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-50"
      >
        {pendente ? 'Sincronizando…' : 'Sincronizar agora'}
      </button>
      {estado.mensagem && <span className="text-xs text-ok">{estado.mensagem}</span>}
      {estado.erro && <span className="text-xs text-danger">{estado.erro}</span>}
    </div>
  )
}
```

- [ ] **Passo 5: `app/configuracoes/ConexaoGmail.tsx`** (Server Component)

```tsx
import IndicadoresGmail from '@/components/gmail/indicadores-gmail'
import type { DadosPainelGmail } from '@/lib/gmail/painel'
import EmailLoteList from '@/app/dashboard/EmailLoteList'
import SincronizarGmailButton from './SincronizarGmailButton'

const RETORNO_DO_GOOGLE: Record<string, { classe: string; texto: string }> = {
  conectado: { classe: 'bg-ok-subtle text-ok', texto: 'Gmail conectado.' },
  recusado: { classe: 'bg-warn-subtle text-warn', texto: 'A conexão foi cancelada na tela do Google.' },
  sem_permissao: { classe: 'bg-danger-subtle text-danger', texto: 'A caixa de leitura do Gmail não foi marcada na tela do Google. Conecte de novo e marque a permissão.' },
  state_invalido: { classe: 'bg-danger-subtle text-danger', texto: 'A conexão expirou ou veio de outra aba. Tente de novo.' },
  nao_autorizado: { classe: 'bg-danger-subtle text-danger', texto: 'Só o gestor pode conectar o Gmail.' },
  erro: { classe: 'bg-danger-subtle text-danger', texto: 'Não foi possível conectar. Tente de novo; se repetir, avise o Leonardo.' },
}

export default function ConexaoGmail({ dados, retorno }: { dados: DadosPainelGmail; retorno?: string }) {
  const aviso = retorno ? RETORNO_DO_GOOGLE[retorno] : undefined
  const conectado = dados.integracao?.status === 'conectado'

  return (
    <section className="space-y-3">
      {aviso && <p className={`rounded px-3 py-2 text-sm ${aviso.classe}`}>{aviso.texto}</p>}
      <IndicadoresGmail dados={dados} detalhado />
      <div className="flex flex-wrap items-center gap-3">
        {/* <a> e não <Link>: é uma rota que redireciona ao Google, e o prefetch do Link a chamaria sozinho */}
        <a href="/api/gmail/conectar" className="rounded bg-accent px-3 py-1.5 text-xs text-accent-fg hover:opacity-90">
          {dados.integracao ? 'Reconectar Gmail' : 'Conectar Gmail'}
        </a>
        {conectado && <SincronizarGmailButton />}
      </div>
      {dados.recentes.length > 0 && <EmailLoteList lotes={dados.recentes} />}
    </section>
  )
}
```

- [ ] **Passo 6: `EmailLoteList` aceitar só as colunas usadas**

Em `app/dashboard/EmailLoteList.tsx`:
- troque `type EmailLote = Tables<'emails_recebidos'>` por:
  ```ts
  type EmailLote = Pick<Tables<'emails_recebidos'>, 'id' | 'assunto' | 'remetente' | 'data_recebimento' | 'total_cnj'>
  ```
- troque `{lote.total_cnj} CNJ{lote.total_cnj !== 1 ? 's' : ''}` por:
  ```tsx
  {lote.total_cnj ?? 0} CNJ{lote.total_cnj !== 1 ? 's' : ''}
  ```

Motivo: agora `emails_recebidos` tem `corpo_texto`, e buscar a linha inteira só para listar traria o e-mail todo.

- [ ] **Passo 7: Página de configurações**

Em `app/configuracoes/page.tsx`:
- acrescente os imports:
  ```ts
  import { carregarPainelGmail } from '@/lib/gmail/painel'
  import ConexaoGmail from './ConexaoGmail'
  ```
- mude a assinatura para receber `searchParams` (Next 16: é uma Promise, como em `app/login/page.tsx`):
  ```tsx
  export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
    const usuarioLogado = await requireGestor()
    const [usuarios, dadosGmail, { gmail }] = await Promise.all([fetchUsuarios(), carregarPainelGmail(), searchParams])
  ```
- troque o subtítulo `Gestão de acesso da equipe` por `Gestão de acesso da equipe e integração com o Gmail`;
- acrescente, antes da `<section>` de "Convidar novo usuário":
  ```tsx
  <ConexaoGmail dados={dadosGmail} retorno={gmail} />
  ```

- [ ] **Passo 8: Dashboard**

Em `app/dashboard/page.tsx`:
- importe `carregarPainelGmail` e `IndicadoresGmail`;
- carregue `const dadosGmail = await carregarPainelGmail()` junto das outras buscas (no mesmo `Promise.all`, se houver um);
- renderize `<div className="mb-6"><IndicadoresGmail dados={dadosGmail} /></div>` como **primeiro filho** de `<main className="mx-auto max-w-5xl px-4 py-8">` (hoje na linha 178).

Não mude mais nada no dashboard.

- [ ] **Passo 9: Conferir no navegador**

Com o dev server rodando e logado como gestor (peça o login ao Leonardo **só se** não houver sessão de teste; senão, confira pelo build e pela Tarefa 15):
- `/configuracoes` mostra "Nenhuma conta do Gmail conectada", o botão "Conectar Gmail" e o selo "Modo sombra";
- `/configuracoes?gmail=conectado` mostra a faixa verde;
- `/dashboard` mostra o cartão no topo com o link "Detalhes da integração".

Rode também `npx tsc --noEmit && npm run lint && npm test`.

- [ ] **Passo 10: Commit**

```bash
git add lib/gmail/painel.ts components/gmail app/configuracoes app/dashboard/page.tsx app/dashboard/EmailLoteList.tsx
git commit -m "feat(painel): indicadores da ingestao do Gmail e botao de conexao"
```

---

## Tarefa 13: Resultado do parser na página do e-mail

**Arquivos:**
- Criar: `app/emails/[id]/LeituraDoEmail.tsx`
- Modificar: `app/emails/[id]/page.tsx`

Em sombra, os processos lidos não ficam ligados ao e-mail (`processos.email_id` só é gravado no modo ativo). Por isso a lista "Processos" dessa página ficaria vazia. Esta seção mostra o que o parser leu, e é para ela que os alertas levam.

- [ ] **Passo 1: `app/emails/[id]/LeituraDoEmail.tsx`** (Server Component)

```tsx
import { nomeSistema } from '@/lib/cnj'
import type { ResultadoParser } from '@/lib/gmail/parser'
import type { Tables } from '@/lib/supabase/types'

type EmailLido = Pick<
  Tables<'emails_recebidos'>,
  'lote_id' | 'total_blocos' | 'total_fint' | 'total_validos' | 'total_declarado' | 'total_declarado_assunto' | 'parser_status' | 'modo' | 'aplicacao_status' | 'erro' | 'parser_resultado'
>

const APLICACAO: Record<string, string> = {
  sombra: 'Modo sombra: lido e registrado, não gravado nos processos.',
  antes_do_corte: 'Pauta anterior à ativação: o Cowork já gravou.',
  pendente: 'Aguardando gravação nos processos.',
  aplicado: 'Gravado nos processos.',
  erro_aplicacao: 'Falhou ao gravar nos processos; a próxima sincronização tenta de novo.',
}

export default function LeituraDoEmail({ email }: { email: EmailLido }) {
  const resultado = email.parser_resultado as unknown as ResultadoParser | null
  const numeros: [string, number | null][] = [
    ['Blocos', email.total_blocos],
    ['FINT descartados', email.total_fint],
    ['Válidos', email.total_validos],
    ['Declarado no corpo', email.total_declarado],
    ['Declarado no assunto', email.total_declarado_assunto],
  ]

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-900">Leitura do e-mail</h2>
      {email.aplicacao_status && <p className="text-sm text-zinc-600">{APLICACAO[email.aplicacao_status] ?? email.aplicacao_status}</p>}
      {email.erro && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{email.erro}</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <dt className="text-xs text-zinc-500">{rotulo}</dt>
            <dd className="text-lg font-semibold text-zinc-900">{valor ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {resultado && resultado.avisos.length > 0 && (
        <ul className="space-y-1 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {resultado.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
        </ul>
      )}
      {resultado && resultado.processos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Publicação</th>
                <th className="px-3 py-2 font-medium">CNJ</th>
                <th className="px-3 py-2 font-medium">Sistema</th>
                <th className="px-3 py-2 font-medium">Vara</th>
                <th className="px-3 py-2 font-medium">Observação</th>
              </tr>
            </thead>
            <tbody>
              {resultado.processos.map((processo) => (
                <tr key={processo.numeroCnj} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{processo.publicacoes.join(', ')}</td>
                  <td className="px-3 py-2 font-mono">{processo.numeroCnj}</td>
                  <td className="px-3 py-2">{processo.sistema ? nomeSistema(processo.sistema) : 'Revisar à mão'}</td>
                  <td className="px-3 py-2">{processo.vara ?? '—'}</td>
                  <td className="px-3 py-2">{processo.observacoes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
```

A página `/emails/[id]` já usa a paleta `zinc`, e esta seção segue a página. Antes de usar `nomeSistema`, confira em `lib/cnj.ts:170` que a assinatura é `(sistema: string | null) => string` e que ela trata `pje_2g`.

- [ ] **Passo 2: Usar na página**

Em `app/emails/[id]/page.tsx`:
- importe `LeituraDoEmail from './LeituraDoEmail'`;
- logo depois do `</div>` do cabeçalho (o bloco com `<h1>`) e antes de `<section>` "Processos", acrescente:
  ```tsx
  {email.gmail_message_id && <LeituraDoEmail email={email} />}
  ```

O `select('*')` já traz as colunas novas.

- [ ] **Passo 3: Conferir e commitar**

```bash
npx tsc --noEmit && npm run lint
git add "app/emails/[id]"
git commit -m "feat(painel): resultado do parser na pagina do e-mail"
```

---

## Tarefa 14: Revisão, `.env.example` e deploy (sombra)

- [ ] **Passo 1: Completar o `.env.example`**

No fim de `.env.example` (as 4 variáveis do Gmail já estão lá desde o commit `1169efb`), acrescente:
```
# Modo da ingestão do Gmail: "sombra" (padrão; lê e registra sem tocar em processos) ou "ativo"
GMAIL_INGESTAO_MODO=sombra

# Obrigatória no modo ativo: só pautas com data DEPOIS desta (DD/MM/AAAA) vão para processos
GMAIL_LOTE_CORTE=

# Opcional: remetentes aceitos, separados por vírgula (padrão: intimacoes@exemplo-adv.example,oabmg@recortedigital.adv.br)
GMAIL_REMETENTES=
```
Não crie essas variáveis no Vercel agora: os padrões do código já dão o modo sombra.

- [ ] **Passo 2: Revisão**

Despache `superpowers:code-reviewer` com o escopo "commits desde `1169efb`, contra o plano `docs/superpowers/plans/2026-09-10-ingestao-gmail-api.md` e as regras de `C:\Users\User\.claude\rules\code.md`". Peça atenção a:
- vazamento de token ou segredo em log/resposta;
- rotas sem checagem de gestor/Bearer;
- `duplicata = true` em algum caminho;
- `select` que traga `refresh_token_cifrado` para componente;
- CNJ/nome de cliente em arquivo versionado.

Corrija o que for crítico ou importante e registre o resto em `docs/divida-tecnica.md`.

- [ ] **Passo 3: Portões antes do push**

```bash
npm test && npm run lint && npm run build
git status --short
git log --oneline 1169efb..HEAD
```
Esperado:
- tudo verde;
- nada de `.fixtures-privadas/` ou `.env.local` no status;
- a lista de commits das Tarefas 0 a 14.

- [ ] **Passo 4: Push (= deploy de produção)**

Autorizado pela seção 0.
```bash
git add .env.example
git commit -m "chore: variaveis opcionais do modo da ingestao no .env.example"
git push origin main
```

- [ ] **Passo 5: Conferir o deploy**

Pelo MCP do Vercel:
- `list_deployments` do projeto `prj_oOcwzZSN13rokYXAG6heNnAfM9Ro` (time `team_OyYVusZ76w1OTIAJEn8Y98lD`) até o deploy do último commit ficar `READY`;
- se falhar, `get_deployment_build_logs`, corrija e repita os Passos 3 e 4.

Depois, contra produção:
```bash
curl -s -w "\n%{http_code}\n" -X POST https://ia-controladoria-app.vercel.app/api/gmail/sincronizar
curl -s -o /dev/null -w "%{http_code}\n" https://ia-controladoria-app.vercel.app/privacidade
node .fixtures-privadas/chamar-sincronizar.mjs https://ia-controladoria-app.vercel.app
```
Esperado:
1. `{"error":"Não autorizado."}` e `401`. Se vier HTML de login do Vercel, a proteção de deploy está barrando: confira `get_project_deployment_protection` e pare para falar com o Leonardo;
2. `200`;
3. `200 {"status":"nao_conectado",...}`.

---

## Tarefa 15: PAUSA — conectar o Gmail (quem faz é gente)

Mande ao Leonardo exatamente isto e **espere a resposta**:

> Está no ar. Falta conectar o Gmail, e quem faz é quem tem a senha do `gestor@exemplo-adv.example` (você ou o Rafael):
> 1. Entre no painel como gestor → **Configurações** → **Conectar Gmail**.
> 2. Entre com `gestor@exemplo-adv.example`.
> 3. Na tela "O Google não verificou este app", clique em **Avançado** → **Acessar Controladoria Exemplo (não seguro)**.
> 4. **Marque a caixa** de leitura dos e-mails e clique em **Continuar**.
> 5. Você volta ao painel com "Gmail conectado". Me avise.

Se ele relatar `redirect_uri_mismatch`, peça o endereço que aparece na tela de erro e que ele o acrescente em Google Auth Platform → Clients (seção 1).

Confirme pelo banco, sem ler o token:
```sql
select email_conectado, status, conectado_em from public.integracao_gmail;
```
Esperado: `gestor@exemplo-adv.example`, `conectado`.

---

## Tarefa 16: Validação com e-mail real (modo sombra)

- [ ] **Passo 1: 1ª sincronização (janela de 30 dias)**

```bash
node .fixtures-privadas/chamar-sincronizar.mjs https://ia-controladoria-app.vercel.app
```
Esperado: `200`, `status: ok`, `modo: sombra`, `novos` ≥ 1, `erros: []`. Se `novos` ficar em 25 (o limite por rodada), repita até zerar.

- [ ] **Passo 2: O que foi lido**

```sql
select lote_id, left(remetente, 40) remetente, total_blocos, total_fint, total_validos, total_cnj,
       total_declarado, total_declarado_assunto, parser_status, aplicacao_status, erro
from public.emails_recebidos where gmail_message_id is not null
order by data_recebimento;
```
Critérios:
- todas as pautas dos últimos 30 dias aparecem, **incluindo 20–21/08, 01–04/09, 09/09 e 10/09**;
- `parser_status = 'ok'` em todas (blocos = declarado no corpo = declarado no assunto);
- `aplicacao_status = 'sombra'`;
- nenhuma linha nova em `processos` com `fonte = 'gmail_api'` (`select count(*) from processos where fonte = 'gmail_api'` = 0);
- se houver mais de um e-mail com o mesmo `lote_id`, anote (pode ser um por advogado) e descreva ao Leonardo.

Qualquer `divergente`/`sem_cnj`: abra o `corpo_texto` daquele e-mail só para você (não cole no chat), ache a causa com `superpowers:systematic-debugging`, crie um caso **sintético** que reproduza o problema em `parser.test.ts`, corrija, suba `VERSAO_PARSER` e repita.

- [ ] **Passo 3: Comparar com o que o Cowork gravou**

```sql
-- A) CNJs que o Cowork gravou numa pauta e o parser NÃO achou nessa mesma pauta: tem de ser vazio
with sombra as (
  select e.lote_id, p->>'numeroCnj' as cnj
  from public.emails_recebidos e, jsonb_array_elements(e.parser_resultado->'processos') p
  where e.modo = 'sombra'
)
select pr.lote_id, pr.numero_cnj
from public.processos pr
where pr.fonte = 'gmail'
  and pr.lote_id in (select distinct lote_id from sombra)
  and not exists (select 1 from sombra s where s.cnj = pr.numero_cnj and s.lote_id = pr.lote_id);

-- B) Por pauta: quantos CNJs o parser achou e quantos já existem no banco
with sombra as (
  select e.lote_id, p->>'numeroCnj' as cnj
  from public.emails_recebidos e, jsonb_array_elements(e.parser_resultado->'processos') p
  where e.modo = 'sombra'
)
select s.lote_id, count(*) as lidos,
       count(pr.numero_cnj) as ja_no_banco,
       count(*) - count(pr.numero_cnj) as so_no_gmail
from sombra s left join public.processos pr on pr.numero_cnj = s.cnj
group by s.lote_id order by to_date(s.lote_id, 'DD/MM/YYYY');

-- C) Diferença de sistema entre o parser e o Cowork (informativo; lembrar do alias pje_2g/pje_tjmg_2inst)
with sombra as (
  select e.lote_id, p->>'numeroCnj' as cnj, p->>'sistema' as sistema
  from public.emails_recebidos e, jsonb_array_elements(e.parser_resultado->'processos') p
  where e.modo = 'sombra'
)
select s.lote_id, s.cnj, s.sistema as parser, pr.sistema as banco
from sombra s join public.processos pr on pr.numero_cnj = s.cnj and pr.lote_id = s.lote_id
where coalesce(s.sistema, '') <> coalesce(pr.sistema, '')
  and not (s.sistema = 'pje_2g' and pr.sistema = 'pje_tjmg_2inst')
  and not (s.sistema = 'pje' and pr.sistema = 'pje_tjmg');
```
Critérios:
- **A vazio**. Se não estiver, é bug do parser: corrija antes de seguir;
- em **B**, as pautas que faltavam no banco (20–21/08, 01–04/09, 09/09, 10/09) aparecem com `so_no_gmail` > 0, e isso é esperado;
- **C** vai para o relatório ao Leonardo, só com contagens.

- [ ] **Passo 4: O painel mostra o certo**

Pelo navegador (preview apontando para produção, logado se houver sessão; senão, pelo SQL acima), confira:
- em Configurações e no Dashboard, "Conectado como gestor@exemplo-adv.example", "Sincronizado há X min", "Último e-mail da OAB há …" e nenhum alerta vermelho;
- `/emails/<id>` de uma pauta mostra a tabela lida.

---

## Tarefa 17: Agendamento (pg_cron + pg_net + Vault)

- [ ] **Passo 1: Extensões**

`apply_migration`, nome `pg_cron_e_pg_net`:
```sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
```
Confira com `list_extensions` que as duas estão instaladas.

- [ ] **Passo 2: Gravar o segredo no Vault sem passá-lo pelo chat**

`apply_migration`, nome `tmp_funcao_gravar_segredo_gmail`:
```sql
create or replace function public.tmp_gravar_segredo_gmail_sync(p_segredo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'gmail_sync_secret';
  if v_id is null then
    perform vault.create_secret(p_segredo, 'gmail_sync_secret', 'Bearer do pg_cron para /api/gmail/sincronizar');
  else
    perform vault.update_secret(v_id, p_segredo);
  end if;
end $$;
revoke all on function public.tmp_gravar_segredo_gmail_sync(text) from public, anon, authenticated;
grant execute on function public.tmp_gravar_segredo_gmail_sync(text) to service_role;
```

Crie `.fixtures-privadas/gravar-segredo-vault.mjs` (fora do git) e rode da raiz do painel:
```js
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((linha) => /^[A-Z0-9_]+=/.test(linha))
    .map((linha) => [linha.slice(0, linha.indexOf('=')), linha.slice(linha.indexOf('=') + 1)]),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { error } = await supabase.rpc('tmp_gravar_segredo_gmail_sync', { p_segredo: env.GMAIL_SYNC_SECRET })
console.log(error ? `ERRO: ${error.message}` : 'segredo gravado no Vault')
console.log('sha256 (12 primeiros):', createHash('sha256').update(env.GMAIL_SYNC_SECRET).digest('hex').slice(0, 12))
```
Se o import de `@supabase/supabase-js` não resolver a partir de `.fixtures-privadas/`, copie o script para a raiz, rode e apague.

Confira o hash e **apague a função**. `apply_migration`, nome `drop_tmp_funcao_gravar_segredo_gmail`:
```sql
drop function public.tmp_gravar_segredo_gmail_sync(text);
```
```sql
select left(encode(extensions.digest(decrypted_secret, 'sha256'), 'hex'), 12) as sha256_12
from vault.decrypted_secrets where name = 'gmail_sync_secret';
```
Esperado: os 12 caracteres iguais aos que o script imprimiu.

- [ ] **Passo 3: Agendar**

`apply_migration`, nome `agendar_sincronizacao_gmail`:
```sql
select cron.schedule(
  'gmail-sincronizar',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://ia-controladoria-app.vercel.app/api/gmail/sincronizar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'gmail_sync_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

- [ ] **Passo 4: Ver rodar**

Espere ao menos 16 minutos (use `ScheduleWakeup`/`Monitor`, não `sleep`) e confira:
```sql
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'gmail-sincronizar')
order by start_time desc limit 3;

select status_code, left(content::text, 300) as resposta, created
from net._http_response order by created desc limit 3;

select ultima_sincronizacao_ok_em, ultimo_erro from public.integracao_gmail;
```
Esperado:
- `succeeded` no cron;
- `200` com `"status":"ok"` no pg_net;
- `ultima_sincronizacao_ok_em` com menos de 16 minutos.

Se vier `401`, o segredo do Vault não bate com o do Vercel: refaça o Passo 2 e confira de novo.

---

## Tarefa 18: Documentação e relatório final

- [ ] **Passo 1: Dívida técnica**

Acrescente no **fim** de `docs/divida-tecnica.md`, no mesmo estilo das entradas existentes (título `###`, "Aberto em 10/09/2026", o que é, o que fazer):
- `lib/gmail/google.ts` e `lib/gmail/sincronizar.ts` sem teste automatizado: mock na fronteira HTTP pediria msw, que é dependência nova; hoje a validação é a integração real;
- desvios deliberados do parser em relação ao Cowork (seção 2 deste plano);
- `middleware.ts` depreciado no Next 16 (renomear para `proxy.ts` com o codemod, em outra tarefa);
- o que mais a revisão da Tarefa 14 tiver deixado para depois.

- [ ] **Passo 2: Commit e push**

```bash
npm test && npm run lint && npm run build
git add docs/divida-tecnica.md
git commit -m "docs: pendencias da ingestao via Gmail API"
git push origin main
```

- [ ] **Passo 3: Memória**

Grave uma memória `ingestao-gmail-api` com:
- em que modo a ingestão está;
- onde fica o plano;
- o nome do job no pg_cron;
- que a ativação é outra sessão (seção final);
- que o segredo do cron está no Vault como `gmail_sync_secret`.

Não grave valores de segredo.

- [ ] **Passo 4: Relatório ao Leonardo** (curto, sem comando, sem nome de parte)

1. **O que ficou pronto**, com um exemplo: "o painel lê a pauta do Gmail sozinho a cada 15 min".
2. **Números da validação:**
   - quantas pautas foram lidas e quantas fecharam;
   - se a consulta A deu vazio;
   - quais pautas faltantes apareceram;
   - quantas diferenças de sistema (consulta C).
3. **O que depende dele:** nada até a ativação. O Cowork continua ligado durante a sombra.
4. **Próximo passo:** depois de 3 dias úteis em sombra sem alerta, abrir a sessão de ativação (seção abaixo).

---

## Sessão de ativação (NÃO executar nesta sessão)

Só quando o Leonardo pedir, depois de **pelo menos 3 dias úteis em sombra**, com:
- a consulta A da Tarefa 16 vazia em todos os dias;
- nenhum alerta vermelho sem explicação.

1. **Calcular o corte:**
   ```sql
   select to_char(max(to_date(lote_id, 'DD/MM/YYYY')), 'DD/MM/YYYY') from processos where fonte = 'gmail';
   ```
2. **Levantar o que ficaria de fora e aplicar só com ok:**
   - listar os e-mails em `sombra` com lote **depois** do corte (o Cowork não gravou);
   - listar os das pautas faltantes (20–21/08, 01–04/09), com a quantidade de CNJs de cada um;
   - mostrar ao Leonardo e esperar o ok. É a decisão 4.
3. **Guiar o Leonardo no Vercel** (Production): `GMAIL_INGESTAO_MODO=ativo` e `GMAIL_LOTE_CORTE=<data do passo 1>`. Depois, redeploy.
4. **Aplicar os e-mails aprovados** com `node .fixtures-privadas/chamar-sincronizar.mjs https://ia-controladoria-app.vercel.app '{"aplicar_email_ids":["<id>", ...]}'` e conferir:
   ```sql
   select count(*) from processos where fonte = 'gmail_api';
   select aplicacao_status, count(*) from emails_recebidos group by 1;
   ```
5. **Pedir ao Rafael** que desligue a tarefa agendada do Cowork no Claude Desktop.
6. **Acompanhar a 1ª rodada do agente** com as linhas `gmail_api` (`pendente`, `duplicata = false`).

---

## Autorrevisão do plano (feita ao escrever)

- **Etapas 3–9 do pedido original:**
  - migração → T1; OAuth → T10 e T12; parser TDD → T5;
  - rota de sincronização e modo sombra → T9 e T10; agendamento → T17;
  - indicadores → T8 e T12; transição → T16 e a seção final.
- **Pedidos específicos:**
  - `invalid_grant` → T9 (`AcessoRevogadoError` → `desconectado` → "Reconectar");
  - `fonte` conferida → seção 1;
  - `tratado_manual` → T6.
- **Não coberto de propósito:**
  - modo ativo e desligar o Cowork (dependem de dias de sombra);
  - teste automatizado do cliente HTTP do Google (dependência nova).

