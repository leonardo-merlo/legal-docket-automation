# Exemplo Advogados — Sistema de Automação da Controladoria de Processos

**Versão:** 1.0 — Junho 2026
**Status:** Planejamento concluído — pronto para execução
**Cliente:** Rafael Exemplo (OAB/MG 000.101)
**Escopo:** Fluxo 1 — Automação da controladoria de processos

---

## 1. Contexto e Problema

### 1.1 O escritório

O Escritório Exemplo Advogados, localizado em Muriaé/MG, atua principalmente com processos cíveis de procedimento comum (PJe — TJMG), com foco em causas consumeristas. A equipe é composta por:

| Membro                                           | Papel                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Rafael Exemplo (OAB/MG 000.101)     | Sócio-gestor. Responsável pela supervisão geral e tomada de decisão.              |
| Helena Exemplo (OAB/MG 000102) | Advogada sênior. Mãe do Rafael. Responsável pela área de execução de processos. |
| Marina Exemplo (OAB/MG 000.103)        | Advogada. Em processo de saída do escritório.                                     |
| Estagiários                                      | Apoio operacional.                                                                |

### 1.2 O processo atual — como funciona hoje

O controle dos processos é feito manualmente pela irmã do Rafael, que executa as seguintes etapas todos os dias:

1. Recebe um e-mail diário do serviço Recorte Digital (OAB/MG) com as publicações do Diário de Justiça Eletrônico (DJEN) referentes aos advogados do escritório.
2. Para cada publicação no e-mail, extrai manualmente o número do processo.
3. Acessa o PJE-MG ou o EPROC com login de advogado para consultar o histórico do processo.
4. Lê o histórico e identifica o status atual do processo e o próximo prazo relevante.
5. Com base no status, encaminha a responsabilidade para o advogado correto.
6. Registra tudo manualmente em uma planilha Excel.

### 1.3 Os problemas que justificam a automação

- Processo 100% manual, repetitivo e propenso a erro humano.
- Marina está saindo do escritório, o que pressiona a operação.
- Não há visibilidade centralizada dos prazos para toda a equipe.
- O cálculo de prazo exige interpretação jurídica que varia por processo.
- A planilha Excel não permite colaboração em tempo real nem alertas automáticos.

---

## 2. Dados do E-mail de Entrada

### 2.1 Características do e-mail

| Campo          | Valor                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Remetente fixo | `oabmg@recortedigital.adv.br`                                                                                         |
| Destinatários  | `advogada@exemplo-adv.example` e `intimacoes@exemplo-adv.example`                                                 |
| Frequência     | 1 e-mail por dia útil                                                                                                 |
| Assunto        | `Recorte Digital OAB/MG — Pauta MG [DATA], DJ [DATA] — total N publicações`                                           |
| Conteúdo       | Lista de publicações do DJEN referentes aos advogados do escritório. Cada publicação é uma entrada separada numerada. |

### 2.2 Estrutura de cada publicação no e-mail

Cada publicação dentro do e-mail segue o padrão abaixo (exemplo real):

```
PROCESSO: 5435877-49.2025.8.13.0384 — PROCEDIMENTO COMUM CÍVEL
PROCESSO Nº: 5435877-49.2025.8.13.0384
CLASSE: [CÍVEL] PROCEDIMENTO COMUM CÍVEL (7) FULANO DE TAL CPF: 000.000.000-00
Despacho ID nº 10000000000. JUIZA FICTICIA Leopoldina, data da assinatura eletrônica.
POLO ATIVO: FULANO DE TAL
POLO PASSIVO: EMPRESA FICTICIA
ADVOGADO: Helena Exemplo - OAB: 000102/MG
ADVOGADO: Rafael Exemplo - OAB: 000.101/MG
ADVOGADO: Marina Exemplo - OAB: 000.103/MG
```

### 2.3 Extração do número do processo

O número do processo aparece sempre após a palavra `PROCESSO:` ou `PROCESSO Nº:` e segue o padrão CNJ unificado:

- **Formato CNJ:** `NNNNNNN-DD.AAAA.J.TT.OOOO` — ex: `5435877-49.2025.8.13.0384`
**Regex de extração:** `\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}`

Se uma mesma publicação for detectada mais de uma vez no e-mail (ex.: intimação + certidão no mesmo dia para o mesmo processo), o sistema deve registrar o processo mas sinalizar a duplicata para que o Rafael seja avisado antes de aprovar o encaminhamento.

---

## 3. Arquitetura da Solução

### 3.1 Stack tecnológica

| Componente            | Função                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Cowork**     | Automação principal: leitura do Outlook, extração dos CNJs e metadados dos processos, escrita no Supabase. Agendado via `/schedule` para rodar diariamente. **Fase de teste:** leitura do Gmail do Leo. **Produção (Rafael):** leitura do Outlook via Cowork + skill de extração de CNJ. |
| **Claude API**        | Classificação inteligente do status processual e sugestão de prazo com base no CPC 2015. Chamada programaticamente pelo sistema Python após extração.                                                                                                                             |
| **Playwright (Python)** | Extração dos documentos dos sistemas judiciais via browser (CDP). Acesso autenticado via Chrome com sessão ativa. Suporte atual: PJE TJMG. Expansão planejada: eProc TRF6, TJMG 2ª instância.                                                                                  |
| **Supabase**          | Banco de dados PostgreSQL gerenciado. Armazena processos, documentos, rascunhos de análise e histórico de ações.                                                                                                                                                                  |
| **Next.js + Vercel**  | Sistema web para revisão e aprovação dos encaminhamentos pelo Rafael e painel de tarefas para toda a equipe.                                                                                                                                                                   |
| **Microsoft 365**     | Outlook do escritório para recebimento dos e-mails do Recorte Digital. Integração planejada via Copilot Cowork na máquina do Rafael.                                                                                                                                           |

### 3.2 Fluxo completo de ponta a ponta

```
E-mail chega no Outlook (oabmg@recortedigital.adv.br)
        ↓
[ETAPA 1] Cowork (agendado via /schedule, 1x por dia)
  → Lê o Outlook (ou Gmail em fase de teste), filtra e-mails do remetente fixo
  → Extrai números de processo via regex CNJ + metadados do cabeçalho
  → Detecta duplicatas
  → Registra processos novos no Supabase (status: pendente)
        ↓
[ETAPA 2] Python Playwright — extração de documentos
  → Conecta ao Chrome via CDP (sessão já autenticada pelo usuário)
  → Busca o processo pelo CNJ no sistema judicial (PJE, eProc, etc.)
  → Navega pelos documentos da timeline e extrai o texto completo
  → Salva documentos no Supabase
        ↓
[ETAPA 3] Claude API — classificação e prazo
  → Analisa os documentos extraídos
  → Classifica: Contestação / Sentença/Acordo / Execução
  → Calcula prazo (Cenários A, B ou C)
  → Gera rascunho com responsável e prazo sugeridos
        ↓
[ETAPA 4] Painel Next.js — revisão pelo Rafael
  → Rafael vê os rascunhos pendentes
  → Edita campos se necessário
  → Aprova — SOMENTE então o encaminhamento é disparado
        ↓
[ETAPA 5] Notificação + painel de tarefas
  → Responsável recebe notificação (Teams ou e-mail)
  → Processo aparece no painel individual com prazo visível
```

---

## 4. Detalhamento das Etapas

### Etapa 1 — Leitura do e-mail e extração dos processos

**Trigger e agendamento**

O Cowork é configurado via `/schedule` para executar uma vez por dia útil, no horário a ser definido pelo escritório (sugestão: 09h00). O computador deve estar ligado e o Claude Desktop aberto no horário configurado. Recomenda-se desativar o modo de suspensão na máquina usada.

**Processamento**

- Acessar o Outlook via integração (conectores) com Microsoft 365 .
- Filtrar e-mails não lidos com remetente exato: `oabmg@recortedigital.adv.br`.
- Para cada e-mail, extrair todas as ocorrências do padrão CNJ via regex.
- Para cada número extraído, verificar no Supabase se o processo já existe.
  - Se novo: registrar com status `pendente` e data de recebimento.
  - Se duplicado no mesmo e-mail: criar alerta de duplicata para o Rafael.
- Marcar o e-mail como lido após processamento.

---

### Etapa 2 — Extração de documentos via browser

Esta é a etapa mais crítica do sistema. O Python (Playwright) acessa o sistema judicial diretamente via browser com sessão ativa do usuário.

#### 2.1 Extração via browser (Playwright)

Quando o DataJud (ou a publicação no e-mail) indicar que o evento mais recente relevante é um Despacho, Decisão ou Sentença, o Cowork acessa o PJE para extrair o texto completo:

- O Chrome deve estar aberto com `--remote-debugging-port=9222` e sessão ativa no sistema judicial.
- O Python conecta via CDP e navega diretamente na sessão existente — nunca tenta fazer login.
- Busca o processo pelo número CNJ, navega pela timeline de documentos do mais recente ao mais antigo.
- Extrai o texto completo de cada documento (HTML inline, PDF digital via PDF.js, ou screenshot como fallback).
- Salva os documentos no Supabase vinculados ao processo.

Se o PJE exigir CAPTCHA ou a sessão estiver expirada, o script para aquele processo específico, registra o motivo no Supabase e continua os demais normalmente.

---

### Etapa 3 — Classificação de status e cálculo de prazo (Claude API)

#### Classificação de status

Com as movimentações e o texto do despacho disponíveis no Supabase, a Claude API é chamada com um prompt estruturado contendo a classe processual, a lista de movimentações em ordem cronológica e o texto do despacho mais recente.

A IA retorna um dos três status:

| Status                | Critério                                                                     | Responsável                                         |
| --------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| **CONTESTAÇÃO**       | Processo em fase de defesa, instrução ou manifestações pré-sentença.         | Rafael                                            |
| **SENTENÇA / ACORDO** | Processo com sentença proferida ou acordo homologado aguardando cumprimento. | Marina (ou Rafael enquanto Marina estiver de saída) |
| **EXECUÇÃO**          | Processo em fase de cumprimento de sentença ou execução de título judicial.  | Enilda                                              |

#### Os três cenários de cálculo de prazo

O Rafael identificou três situações distintas para determinação de prazo. O sistema deve tratar cada uma de forma específica:

---

**Cenário A — Prazo explícito no despacho**

O juiz escreve o prazo diretamente no texto do despacho. A IA extrai o número de dias e a data de publicação no DJEN para calcular o vencimento.

> Exemplo: _"Intime-se a parte autora para manifestação no prazo de 15 (quinze) dias."_
> → Prazo: data de publicação + 15 dias úteis.

---

**Cenário B — Prazo via artigo do CPC citado**

O despacho menciona o artigo legal sem escrever o número de dias. A IA aplica o prazo correspondente ao artigo do CPC 2015.

> Exemplo: _"Nos termos do art. 335 do CPC, fluirá o prazo de contestação."_
> → CPC art. 335 = 15 dias úteis para contestar a partir da audiência de conciliação sem acordo.

---

**Cenário C — Prazo subentendido por evento processual**

Não há despacho com prazo explícito. O prazo decorre automaticamente de um evento processual, independente de intimação, por força de lei.

> Exemplo: Audiência de conciliação realizada sem acordo.
> → Por força do art. 335, I do CPC, o réu tem 15 dias úteis para contestar a partir da data da audiência, sem necessidade de nova intimação.

> **⚠️ Regra de segurança para o Cenário C:** Quando o prazo for inferido por evento, o sistema deve incluir um aviso visível no rascunho: `"PRAZO ESTIMADO — baseado em regra processual, não em texto de despacho. Confirmar com o advogado responsável antes de aprovar."` O Rafael deve validar explicitamente antes de aprovar o encaminhamento.

---

#### Tipos de prazo gerados

| Tipo              | Descrição                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Prazo fatal**   | Data limite legal para cumprimento do ato processual. Calculado em dias úteis a partir da data de publicação no DJEN. |
| **Prazo interno** | Prazo operacional interno do escritório, anterior ao fatal, para preparação do ato. Configurável por tipo de ato.     |
| **Prazo +2**      | Alerta de urgência: prazo fatal menos 2 dias úteis. Dispara notificação se o prazo interno tiver passado sem ação.    |

---

### Etapa 4 — Revisão e aprovação pelo Rafael (painel web)

O Rafael acessa o painel web (Next.js) para revisar todos os rascunhos gerados pelo sistema. **Nenhum encaminhamento é disparado sem aprovação explícita do Rafael.**

#### Campos de cada rascunho

| Campo                  | Descrição                                                          |
| ---------------------- | ------------------------------------------------------------------ |
| Número do processo     | Número CNJ formatado + link direto para o PJE                      |
| Partes                 | Polo ativo, polo passivo e advogados                               |
| Vara / comarca         | Órgão julgador                                                     |
| Último evento          | Nome e data do evento mais recente identificado                    |
| Texto do despacho      | Trecho extraído do despacho mais recente (quando disponível)       |
| Status sugerido        | CONTESTAÇÃO / SENTENÇA/ACORDO / EXECUÇÃO — **editável**            |
| Responsável sugerido   | Rafael / Marina / Enilda — **editável**                           |
| Prazo fatal sugerido   | Data calculada — **editável**                                      |
| Prazo interno sugerido | Data calculada — **editável**                                      |
| Cenário de prazo       | A, B ou C — indica o grau de confiança do cálculo                  |
| Observações da IA      | Justificativa da classificação e alertas (ex.: prazo subentendido) |

#### Ações disponíveis

- **Aprovar e enviar** — dispara notificação para o responsável.
- **Editar qualquer campo** — antes de aprovar.
- **Rejeitar** — arquiva o rascunho com anotação.
- **Solicitar reprocessamento** — pede ao sistema para reanalisar o processo.

---

### Etapa 5 — Notificação e painel de tarefas

Após aprovação do Rafael, o sistema notifica o responsável e registra o processo no painel individual de tarefas.

**Notificação**

- Canal: Microsoft Teams (mensagem direta) ou e-mail — a definir com o Rafael.
- Conteúdo: número do processo, status, prazo fatal, prazo interno e link para o painel.

**Painel de tarefas individual**

- Cada membro da equipe vê apenas os processos atribuídos a ele.
- Ordenação padrão: por prazo fatal (mais urgente primeiro).
- Indicadores visuais: verde (dentro do prazo interno), amarelo (prazo +2), vermelho (prazo fatal próximo).
- Ações: marcar como concluído, adicionar observação, solicitar revisão do Rafael.

---

## 5. Estrutura de Dados (Supabase)

| Tabela       | Campos principais                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `processos`  | Número CNJ, sistema, vara, partes, status atual, `responsavel_id` (FK → `usuarios.id`), data da última consulta, `pje_status` (pendente / processado / erro / captcha_bloqueado).                                     |
| `documentos` | ID do processo (FK), índice, número do documento, URL iframe, texto extraído, título, juntado_por, cargo, data do documento, data de extração.                                                                         |
| `rascunhos`  | ID do processo (FK), status sugerido, `responsavel_sugerido_id` (FK → `usuarios.id`), prazo fatal sugerido, prazo interno sugerido, cenário (A/B/C), justificativa, alerta, risco, status (pendente / aprovado / rejeitado). |
| `tarefas`    | ID do rascunho aprovado (FK), responsável, prazo fatal, prazo interno, status (aberta / concluída), observações.                                                                                                       |
| `usuarios`   | Nome, e-mail, papel (gestor / advogado / estagiário), ativo.                                                                                                                                                           |

---

## 6. Configurações e Dependências Operacionais

| Dependência            | Detalhe                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Desktop**     | Instalado e logado com conta Pro, Max, Team ou Enterprise. Deve estar aberto no horário de execução agendada.                                                                                                   |
| **Chrome com CDP**     | Chrome aberto com `--remote-debugging-port=9222 --user-data-dir=C:\chrome-debug`. Sessão ativa no sistema judicial — nunca armazenamos senha. O Playwright conecta na sessão existente.                         |
| **Python + venv**      | `.\venv\Scripts\activate` antes de rodar qualquer script. Dependências em `requirements.txt`.                                                                                                                   |
| **M365 / Outlook**     | Conta Microsoft 365 do escritório para recebimento dos e-mails do Recorte Digital. Leitura via Copilot Cowork na máquina do Rafael. **Fase de teste:** Gmail do Leo via MCP de e-mail.                        |
| **Máquina ligada**     | O PC deve estar ligado e sem modo de suspensão no horário agendado. Recomendado: máquina dedicada ou notebook fixo de escritório.                                                                               |
| **Vercel (Next.js)**   | Deploy do painel web. Variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.                                                                             |

---

## 7. Ordem de Desenvolvimento

O sistema é entregue completo, mas a ordem abaixo reduz risco e permite validação incremental com o Rafael:

1. **Banco de dados e estrutura base** — criar tabelas no Supabase, configurar variáveis de ambiente no Vercel, validar conexões. ✅
2. **Extração via Playwright (PJE TJMG)** — `pje_extractor.py` conecta via CDP, navega processos e extrai documentos. ✅
3. **Classificação via Claude API** — `analyzer.py` analisa documentos e gera rascunho com status, responsável e prazo. ✅
4. **Persistência no Supabase** — `supabase_writer.py` persiste processos, documentos e rascunhos. ✅
5. **Painel web — visão do Rafael** — painel de revisão no Next.js com campos editáveis, aprovação e rejeição. ✅
6. **Painel web — painel de tarefas da equipe** — painel individual com indicadores de prazo. ✅
7. **Expansão de sistemas** — implementar extratores para eProc TRF6, TJMG 2ª instância e outros conforme mapeamento com o Rafael.
8. **Automação do e-mail (produção)** — skill do Cowork na máquina do Rafael: lê Outlook → extrai CNJs → atualiza Supabase → aciona extração.

---

## 8. Riscos e Mitigações

| Risco                                          | Mitigação                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CAPTCHA no PJE**                             | O Playwright detecta a tela de CAPTCHA, registra `captcha_bloqueado` no Supabase, notifica o Rafael para resolução manual e continua os demais processos.             |
| **Sessão expirada no sistema judicial**        | O script detecta redirecionamento para login, registra o motivo no Supabase e interrompe aquele processo sem quebrar o lote.                                             |
| **Prazo calculado incorretamente (Cenário C)** | Flag visual obrigatório no rascunho para prazo inferido. Rafael valida explicitamente antes de aprovar.                                                                |
| **PC desligado no horário agendado**           | Configurar para não suspender no horário. Chrome com CDP deve estar aberto e logado antes da execução.                                                                  |
| **Marina saindo do escritório**                 | Processos de Sentença/Acordo redirecionados ao Rafael até definição do substituto. O campo de responsável é editável no painel — fácil de ajustar sem código.         |

---

## 9. Glossário

| Termo             | Definição                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CNJ**           | Conselho Nacional de Justiça. Órgão que padroniza os números de processo judiciais no Brasil.                                                                             |
| **DJEN**          | Diário de Justiça Eletrônico Nacional. Publicação oficial onde constam as intimações e despachos processuais.                                                             |
| **PJE**           | Processo Judicial Eletrônico. Sistema adotado pelo TJMG para tramitação eletrônica de processos cíveis.                                                                   |
| **EPROC**         | Sistema alternativo ao PJE, usado em alguns tribunais federais.                                                                                                           |
| **Despacho**      | Ato do juiz que determina providências processuais, como intimações, prazos e diligências.                                                                                |
| **Prazo fatal**   | Data limite para cumprimento de ato processual. Perda do prazo implica preclusão ou nulidade.                                                                             |
| **Prazo interno** | Prazo operacional interno do escritório, anterior ao fatal, para preparação do ato.                                                                                       |
| **Contestação**   | Fase em que o réu apresenta sua defesa. Prazo padrão: 15 dias úteis (CPC, art. 335).                                                                                      |
| **Execução**      | Fase de cumprimento de sentença (art. 523 CPC) ou execução de título extrajudicial.                                                                                       |
| **Cowork**        | Produto da Anthropic que permite automação de tarefas no desktop, incluindo browser, arquivos e integrações com Microsoft 365. Suporta tarefas agendadas via `/schedule`. |
