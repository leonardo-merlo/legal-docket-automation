---
name: controladoria-juridica
description: >
  Skill de controladoria automática de processos jurídicos para o escritório Recorte Digital.
  Executa o ciclo completo diário: lê e-mails do Gmail com notificações de processos,
  extrai números CNJ, consulta o Supabase (tabela `processos`), busca movimentações na API
  DataJud, acessa os sistemas PJE/Eproc via browser para extrair textos de documentos,
  classifica cada processo via Claude API e grava rascunhos de resposta, e ao final envia
  e-mail de resumo para o Rafael.

  USE ESTA SKILL SEMPRE que o usuário mencionar: "rodar a controladoria", "processar processos",
  "verificar processos jurídicos", "atualizar processos do escritório", "rodou hoje?",
  "checar movimentações", ou qualquer variação de execução do fluxo jurídico automatizado.
  A skill também é o alvo do agendamento diário às 9h em dias úteis.
---

# Controladoria de Processos Jurídicos — Recorte Digital

## Visão Geral

Este fluxo processa notificações jurídicas de ponta a ponta, sem depender do servidor Next.js.
O Cowork acessa Supabase, DataJud, Gmail e os sistemas judiciais diretamente.

Siga **cada etapa na ordem exata**. Se uma etapa falhar para um processo específico, registre
o erro no Supabase e **continue para o próximo processo** — nunca aborte o lote inteiro.

---

## ETAPA 1 — Ler e-mails do Gmail

**Objetivo:** encontrar e-mails não lidos de `dev@example.com` e extrair números CNJ.

1. Acesse o Gmail via MCP de e-mail (conector Gmail disponível no Cowork).
2. Busque e-mails **não lidos** na conta `dev@example.com`.
3. Para cada e-mail encontrado, extraia todos os números CNJ usando o padrão:
   ```
   \d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}
   ```
4. Para cada número extraído, identifique se é **federal ou estadual**:
   - Presença de "DJEN", "Diário da Justiça Federal", "TRF" no corpo → **federal**
   - Demais casos → **estadual**
5. Consolide todos os números em uma lista, removendo duplicatas.
6. **Registre o e-mail na tabela `emails_recebidos`** usando a query em `references/supabase-ops.md`:
   - `remetente` = endereço do remetente
   - `assunto` = assunto do e-mail
   - `data_recebimento` = data/hora de recebimento
   - `total_cnj` = número de CNJs únicos extraídos
     Guarde o `id` retornado — será o `{email_id}` para vincular os processos na Etapa 3.
7. Marque o e-mail como lido após registrar.
   > Se não houver e-mails não lidos, envie e-mail para o Rafael informando "nenhuma
   > movimentação hoje" e encerre.

---

## ETAPA 2 — Identificar o sistema pelo número CNJ

Para cada número CNJ extraído, determine o sistema de origem:

| Critério                                          | Sistema                        | Tipo     |
| ------------------------------------------------- | ------------------------------ | -------- |
| Primeiro dígito do número = `5`                   | PJE (pje.tjmg.jus.br)          | Estadual |
| Primeiro dígito do número = `1` + **não** federal | Eproc TJMG (eproc.tjmg.jus.br) | Estadual |
| Marcado como **federal** na Etapa 1               | Eproc TRF6 (eproc.trf6.jus.br) | Federal  |

> O "primeiro dígito" é o primeiro caractere numérico do número completo (antes do primeiro `-`).
> Exemplo: `5001234-56.2024.8.13.0001` → PJE. `1001234-56.2024.8.13.0001` → Eproc TJMG.

Guarde para cada processo: `{ numero_cnj, sistema, tipo (federal|estadual) }`.

---

## ETAPA 3 — Sincronizar com o Supabase

Leia `references/supabase-ops.md` para as queries exatas.

Para cada processo:

1. **Busque** na tabela `processos` pelo campo `numero_cnj`.
2. **Se não existe:** insira um novo registro com:
   - `numero_cnj`, `sistema`, `tipo`
   - `data_criacao = now()`
   - `data_ultima_consulta = now()`
   - `pje_status = 'pendente'`
3. **Se existe:** atualize apenas `data_ultima_consulta = now()`.
4. Recupere o `id` do registro para usar nas etapas seguintes.

---

## ETAPA 4 — Consultar a API DataJud

Leia `references/datajud-api.md` para os endpoints, autenticação e formato de resposta.

Para cada processo:

1. Chame o endpoint DataJud correto (TJMG ou TRF6) com o `numero_cnj`.
2. Receba a lista de movimentações retornadas.
3. Com os dados do `_source`, **atualize o registro em `processos`** com:
   - `polo_ativo`, `polo_passivo` (extraídos de `partes`)
   - `vara`, `comarca` (de `orgaoJulgador.nome`)
   - `classe_processual` (de `classe.nome`)
   - `data_ajuizamento` (de `dataAjuizamento`)
     Leia `references/supabase-ops.md` para a query exata de atualização.
4. Para cada movimentação:
   - Verifique se já existe em `movimentacoes` pelo campo `codigo_cnj` (deduplicação).
   - **Se não existe:** insira na tabela `movimentacoes` com todos os campos disponíveis.
   - **Se existe:** ignore (não sobrescreva).
5. Guarde a lista de movimentações **recentes** (últimas 30 dias ou as 10 mais recentes)
   para uso na Etapa 5.

---

## ETAPA 5 — Acessar o sistema judicial e extrair textos

> **Premissa desta etapa:** o PJE e o Eproc usam autenticação com segundo fator (token OTP) que
> muda a cada hora — login automático não é viável. O operador (Rafael ou Leonardo) deve ter
> o sistema judicial **já aberto e com sessão ativa** no browser antes de o Cowork executar esta
> etapa. O Cowork navega na sessão existente — **nunca tenta fazer login**.

Leia `references/sistemas-juridicos.md` para as URLs de acesso direto, seletores e estrutura
de navegação de cada sistema.

Para cada processo, com base no `sistema` identificado na Etapa 2:

### Passo 1 — Verificar sessão ativa

1. Abra o browser e acesse diretamente a URL do sistema correspondente:
   - `pje` → `https://pje.tjmg.jus.br`
   - `eproc_tjmg` → `https://eproc.tjmg.jus.br`
   - `eproc_trf6` → `https://eproc.trf6.jus.br`
2. **Se a página exibir formulário de login:** sessão expirada — siga o tratamento abaixo.
   **Se a página exibir a área logada:** prossiga para o Passo 2.

### Passo 2 — Determinar o escopo temporal de busca

Antes de navegar no sistema, defina **quais movimentações buscar** com base no que o DataJud
já retornou na Etapa 4:

**Caso A — DataJud retornou movimentações:**

- Identifique a data da movimentação mais recente salva na tabela `movimentacoes` para este processo.
- No sistema judicial, busque **apenas documentos com data posterior a essa data**.
- Objetivo: capturar somente o que o DataJud ainda não indexou (lag de 1–2 semanas).
  **Caso B — DataJud não retornou movimentações (processo sem dados ou lag total):**
- Busque **todo o histórico de movimentações** disponível no sistema.
- Não há ponto de corte — leia tudo desde o início.

### Passo 3 — Navegar e extrair documentos

1. Busque o processo pelo número CNJ no campo de pesquisa do sistema.
2. Acesse a lista de movimentações/andamentos dentro do escopo definido no Passo 2.
3. Para cada movimentação no escopo:
   - **Prioridade máxima:** documentos do tipo "Despacho" ou "Decisão" — leia integralmente.
     Atenção: nem toda movimentação tem despacho anexado; se não houver documento, registre
     apenas os metadados da movimentação (nome, data, complemento).
   - **Leia também** os demais documentos recentes para manter contexto do estado processual
     (petições, certidões, conclusões). Não se limite ao último despacho.
4. Extraia o texto completo de cada documento aberto.
5. Concatene os textos com separador `\n---DOCUMENTO [data] [tipo]---\n`.
6. Salve no campo `texto_despacho` da(s) movimentação(ões) correspondente(s) na tabela
   `movimentacoes`. Use a query de `references/supabase-ops.md`.

### Tratamento de sessão expirada:

Se o sistema exibir tela de login ao tentar acessar:

1. Atualize `pje_status = 'captcha_bloqueado'` e `data_ultima_tentativa = now()` em `processos`
   para este processo (reutilizamos este status para indicar "requer intervenção manual").
2. Registre em `observacoes`: `'Sessão expirada no {sistema} — fazer login manualmente e reprocessar.'`
3. **Não tente fazer login** — siga para o próximo processo.
4. Adicione este processo à lista de "bloqueados" para o e-mail final (Etapa 7).

### Tratamento de outros erros de browser:

- Timeout, elemento não encontrado, estrutura inesperada da página: registre
  `pje_status = 'erro_browser'` com detalhes em `observacoes`, e siga para o próximo processo.

---

## ETAPA 6 — Classificar via Claude API

Para cada processo que chegou até aqui sem erro:

1. Monte o contexto completo:
   - Número CNJ e sistema
   - Histórico completo de movimentações (da tabela `movimentacoes`)
   - Textos dos documentos extraídos na Etapa 5
2. Chame a Claude API (modelo `claude-sonnet-4-6`) com o prompt abaixo:

```
Você é um assistente jurídico especializado em direito processual civil brasileiro (CPC 2015).
Analise o processo abaixo e retorne EXCLUSIVAMENTE um JSON válido, sem texto antes ou depois.

Número CNJ: {numero_cnj}
Sistema: {sistema}

=== MOVIMENTAÇÕES (cronológica, mais recente primeiro) ===
{movimentacoes_formatadas}

=== TEXTOS DOS DOCUMENTOS EXTRAÍDOS ===
{textos_extraidos}

Retorne este JSON exato (sem markdown, sem comentários):
{
  "status_sugerido": "<CONTESTACAO | SENTENCA_ACORDO | EXECUCAO>",
  "responsavel_sugerido": "<rafael | enilda | marina>",
  "cenario_prazo": "<A | B | C>",
  "prazo_fatal_dias_uteis": <número inteiro ou null>,
  "prazo_interno_dias_uteis": <número inteiro ou null>,
  "justificativa": "<explicação em 2-4 frases do raciocínio jurídico>",
  "alerta": "<null ou mensagem de alerta quando cenário C ou prazo inferido>",
  "classificacao_risco": "<BAIXO | MEDIO | ALTO | CRITICO>"
}

Regras obrigatórias:
- status_sugerido: CONTESTACAO = fase de defesa/instrução pré-sentença; SENTENCA_ACORDO = sentença proferida ou acordo homologado; EXECUCAO = cumprimento de sentença ou execução de título.
- responsavel_sugerido: rafael = CONTESTACAO; enilda = EXECUCAO; marina = SENTENCA_ACORDO.
- cenario_prazo A = prazo em dias escrito explicitamente no despacho; B = prazo via artigo do CPC citado no despacho; C = prazo subentendido por evento processual sem despacho explícito.
- prazo_fatal_dias_uteis: dias úteis a contar da data de publicação no DJEN. null se não identificável.
- prazo_interno_dias_uteis: prazo_fatal_dias_uteis - 3 dias úteis. null se fatal for null.
- alerta: obrigatório e não-null quando cenario_prazo = C. Use: "PRAZO ESTIMADO — baseado em regra processual, não em texto de despacho. Confirmar com o advogado responsável antes de aprovar."
```

3. Parse o JSON retornado. Antes de inserir no banco:
   - Resolva `responsavel_sugerido` (texto: `"rafael"`, `"enilda"` ou `"marina"`) para UUID
     usando a query auxiliar de `references/supabase-ops.md` ("Resolver nome do responsável para UUID").
   - Use o UUID retornado como `responsavel_sugerido_id` na inserção do rascunho.
     Salve na tabela `rascunhos` com todos os campos estruturados.
     Leia `references/supabase-ops.md` para a query de inserção exata.
     Se a Claude API retornar texto inválido (não-JSON), registre `pje_status = 'erro_classificacao'`
     em `processos` e inclua o processo na lista de erros do e-mail final.

---

## ETAPA 7 — Notificar o Rafael por e-mail

Ao finalizar o processamento de todos os processos, envie um e-mail para o Rafael
com o endereço de destino recuperado do Supabase Vault (chave: `rafael_email`).

### Estrutura do e-mail:

**Assunto:** `[Controladoria] Relatório diário — {data_hoje} ({N} processos)`

**Corpo:**

```
Olá Rafael,

O processamento automático de hoje foi concluído. Resumo:

✅ Processos processados com sucesso: {N_sucesso}
📝 Rascunhos gerados para revisão: {N_rascunhos}
🔴 Bloqueados por CAPTCHA: {N_captcha}
⚠️  Erros de acesso ao sistema: {N_erros}

--- DETALHES DOS PROCESSOS ---

{Para cada processo, uma linha com: número CNJ | sistema | status | classificação de risco}

--- CAPTCHAS (requerem ação manual) ---
{Lista dos processos bloqueados, se houver}

Os rascunhos estão disponíveis no painel para revisão e aprovação.

Abraços,
Controladoria Automatizada
```

Envie o e-mail via MCP do Outlook/Gmail conectado.

---

## Controle de Erros e Resiliência

- **Nunca aborte o lote completo** por falha em um processo individual.
- Cada processo é independente — falhas são registradas e o fluxo continua.
- Se a Etapa 4 (DataJud) falhar, ainda execute a Etapa 5 (browser).
- Se a Etapa 5 falhar, ainda execute a Etapa 6 com o que houver de movimentações.
- Ao final, sempre execute a Etapa 7 (notificação), mesmo que todos os processos tenham falhado.

---

## Referências

- `references/datajud-api.md` — Endpoints, autenticação e formato de resposta DataJud
- `references/sistemas-juridicos.md` — URLs, seletores e fluxo de login PJE, Eproc TJMG e TRF6
- `references/supabase-ops.md` — Queries e estrutura das tabelas no Supabase
