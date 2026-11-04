# Supabase — Operações e Schema

## Conexão

As credenciais do Supabase estão no ambiente do Cowork (via MCP do Supabase ou variáveis
de ambiente). URL e chave de serviço ficam em:

- `SUPABASE_URL` — URL do projeto
- `SUPABASE_SERVICE_KEY` — chave de serviço (acesso total, não use a anon key)

Para acesso ao Vault, use a chave de serviço (necessário `service_role`).

---

## Tabelas Relevantes

### `emails_recebidos`

| Coluna                 | Tipo        | Descrição                                              |
| ---------------------- | ----------- | ------------------------------------------------------ |
| `id`                   | uuid (PK)   | Identificador único                                    |
| `remetente`            | text        | Endereço de e-mail do remetente                        |
| `assunto`              | text        | Assunto do e-mail                                      |
| `data_recebimento`     | timestamptz | Data/hora de recebimento do e-mail                     |
| `data_processamento`   | timestamptz | Data/hora em que o Cowork processou o e-mail           |
| `total_cnj`            | integer     | Número de CNJs únicos extraídos deste e-mail           |

### `processos`

| Coluna                  | Tipo          | Descrição                                                                           |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------- |
| `id`                    | uuid (PK)     | Identificador único                                                                 |
| `numero_cnj`            | text (UNIQUE) | Número no padrão CNJ                                                                |
| `sistema`               | text          | `pje`, `eproc_tjmg` ou `eproc_trf6`                                                 |
| `tipo`                  | text          | `estadual` ou `federal`                                                             |
| `pje_status`            | text          | `pendente`, `processado`, `captcha_bloqueado`, `erro_browser`, `erro_classificacao` |
| `polo_ativo`            | text          | Nome da parte autora (preenchido via DataJud na Etapa 4)                            |
| `polo_passivo`          | text          | Nome da parte ré (preenchido via DataJud na Etapa 4)                                |
| `vara`                  | text          | Vara responsável (de `orgaoJulgador.nome`)                                          |
| `comarca`               | text          | Comarca (extraída de `orgaoJulgador.nome` quando disponível)                        |
| `classe_processual`     | text          | Ex.: "Procedimento Comum Cível" (de `classe.nome`)                                  |
| `data_ajuizamento`      | date          | Data de distribuição (de `dataAjuizamento`)                                         |
| `status_atual`          | text          | Último status classificado: `CONTESTACAO`, `SENTENCA_ACORDO`, `EXECUCAO`            |
| `responsavel_id`        | uuid (FK)     | ID do usuário responsável (FK → `usuarios.id`)                                      |
| `data_criacao`          | timestamptz   | Quando foi inserido                                                                 |
| `data_ultima_consulta`  | timestamptz   | Última execução da controladoria                                                    |
| `data_ultima_tentativa` | timestamptz   | Última tentativa de acesso ao sistema judicial                                      |
| `observacoes`           | text          | Erros ou notas de execução                                                          |
| `email_id`              | uuid (FK)     | E-mail que originou este processo (FK → `emails_recebidos.id`)                      |

### `movimentacoes`

| Coluna                 | Tipo                     | Descrição                                    |
| ---------------------- | ------------------------ | -------------------------------------------- |
| `id`                   | uuid (PK)                | Identificador único                          |
| `processo_id`          | uuid (FK → processos.id) | Processo pai                                 |
| `codigo_cnj`           | integer                  | Código da tabela CNJ (deduplicação)          |
| `nome_movimento`       | text                     | Nome do movimento                            |
| `data_movimento`       | timestamptz              | Data/hora do movimento                       |
| `complemento_tabelado` | text                     | Complemento padronizado                      |
| `complemento_livre`    | text                     | Texto livre                                  |
| `orgao_julgador`       | text                     | Vara/câmara responsável                      |
| `texto_despacho`       | text                     | Texto extraído do sistema judicial (Etapa 5) |
| `data_extracao`        | timestamptz              | Quando o texto foi extraído                  |

### `rascunhos`

| Coluna                     | Tipo                     | Descrição                                                            |
| -------------------------- | ------------------------ | -------------------------------------------------------------------- |
| `id`                       | uuid (PK)                | Identificador único                                                  |
| `processo_id`              | uuid (FK → processos.id) | Processo pai                                                         |
| `status_sugerido`          | text                     | `CONTESTACAO`, `SENTENCA_ACORDO` ou `EXECUCAO`                       |
| `responsavel_sugerido_id`  | uuid (FK)                | ID do usuário sugerido como responsável (FK → `usuarios.id`)         |
| `cenario_prazo`            | text                     | `A`, `B` ou `C`                                                      |
| `prazo_fatal_dias_uteis`   | integer                  | Dias úteis a partir da publicação no DJEN. null se não identificável |
| `prazo_interno_dias_uteis` | integer                  | prazo_fatal - 3 dias úteis. null se fatal for null                   |
| `justificativa`            | text                     | Raciocínio jurídico da classificação (2-4 frases)                    |
| `alerta`                   | text                     | null, ou aviso obrigatório quando cenário C                          |
| `classificacao_risco`      | text                     | `BAIXO`, `MEDIO`, `ALTO` ou `CRITICO`                                |
| `status`                   | text                     | `pendente`, `aprovado`, `rejeitado`                                  |
| `data_criacao`             | timestamptz              | Quando foi gerado                                                    |
| `data_revisao`             | timestamptz              | Quando o Rafael revisou                                            |

---

## Queries de Operação

### Registrar e-mail recebido (Etapa 1 — executar ANTES de processar os CNJs)

```sql
INSERT INTO emails_recebidos (remetente, assunto, data_recebimento, total_cnj)
VALUES ('{remetente}', '{assunto}', '{data_recebimento}', {total_cnj})
RETURNING id;
```

> Guarde o `id` retornado como `{email_id}` para vincular os processos na Etapa 3.

---

### Verificar se processo existe

```sql
SELECT id, pje_status, data_ultima_consulta
FROM processos
WHERE numero_cnj = '{numero_cnj}'
LIMIT 1;
```

### Inserir novo processo

```sql
INSERT INTO processos (numero_cnj, sistema, tipo, pje_status, email_id, data_criacao, data_ultima_consulta)
VALUES ('{numero_cnj}', '{sistema}', '{tipo}', 'pendente', '{email_id}', now(), now())
RETURNING id;
```

### Atualizar data de consulta

```sql
UPDATE processos
SET data_ultima_consulta = now()
WHERE numero_cnj = '{numero_cnj}';
```

### Atualizar processo com dados do DataJud (Etapa 4)

```sql
UPDATE processos
SET polo_ativo        = '{polo_ativo}',
    polo_passivo      = '{polo_passivo}',
    vara              = '{vara}',
    comarca           = '{comarca}',
    classe_processual = '{classe_processual}',
    data_ajuizamento  = '{data_ajuizamento}'
WHERE id = '{processo_id}';
```

> Extração dos campos do `_source` DataJud:
>
> - `polo_ativo` / `polo_passivo`: itere `partes[]`, filtre por `polo = 'ATIVO'` e `polo = 'PASSIVO'`, concatene nomes com `, ` se houver múltiplas.
> - `vara`: `orgaoJulgador.nome`
> - `comarca`: tente extrair da string `orgaoJulgador.nome` (ex.: "1ª Vara Cível de **Muriaé**") ou use `orgaoJulgador.codigoCidade` se disponível.
> - `classe_processual`: `classe.nome`
> - `data_ajuizamento`: `dataAjuizamento` (formato ISO 8601, converta para `date`).

### Atualizar status CAPTCHA

```sql
UPDATE processos
SET pje_status = 'captcha_bloqueado',
    data_ultima_tentativa = now()
WHERE id = '{processo_id}';
```

### Resolver nome do responsável para UUID (antes de atualizar processos ou inserir rascunho)

A Claude API retorna o nome do responsável (ex.: `"Rafael"`). Antes de gravar no banco,
resolva o UUID correspondente:

```sql
SELECT id FROM usuarios WHERE nome ILIKE '%{nome_responsavel}%' AND ativo = true LIMIT 1;
```

> Guarde o `id` retornado como `{responsavel_id}` ou `{responsavel_sugerido_id}` para usar
> nas queries abaixo.

---

### Atualizar status após classificação com sucesso

```sql
UPDATE processos
SET pje_status           = 'processado',
    status_atual         = '{status_sugerido}',
    responsavel_id       = '{responsavel_id}',
    data_ultima_consulta = now()
WHERE id = '{processo_id}';
```

### Verificar se movimentação já existe (deduplicação)

```sql
SELECT id FROM movimentacoes
WHERE processo_id = '{processo_id}'
  AND codigo_cnj = {codigo_cnj}
LIMIT 1;
```

### Inserir movimentação nova

```sql
INSERT INTO movimentacoes
  (processo_id, codigo_cnj, nome_movimento, data_movimento,
   complemento_tabelado, complemento_livre, orgao_julgador)
VALUES
  ('{processo_id}', {codigo_cnj}, '{nome_movimento}', '{data_movimento}',
   '{complemento_tabelado}', '{complemento_livre}', '{orgao_julgador}')
RETURNING id;
```

### Atualizar texto_despacho em movimentação

```sql
UPDATE movimentacoes
SET texto_despacho = '{texto}',
    data_extracao = now()
WHERE id = '{movimentacao_id}';
```

### Inserir rascunho (com todos os campos estruturados)

```sql
INSERT INTO rascunhos (
  processo_id,
  status_sugerido,
  responsavel_sugerido_id,
  cenario_prazo,
  prazo_fatal_dias_uteis,
  prazo_interno_dias_uteis,
  justificativa,
  alerta,
  classificacao_risco,
  status,
  data_criacao
)
VALUES (
  '{processo_id}',
  '{status_sugerido}',
  '{responsavel_sugerido_id}',
  '{cenario_prazo}',
  {prazo_fatal_dias_uteis},
  {prazo_interno_dias_uteis},
  '{justificativa}',
  {alerta_ou_null},
  '{classificacao_risco}',
  'pendente',
  now()
)
RETURNING id;
```

> `{alerta_ou_null}`: use `NULL` (sem aspas) quando a IA retornar `null`, ou `'{texto}'` quando houver mensagem.

---

## Recuperar Segredos do Vault

```sql
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = '{nome_da_chave}';
```

Chaves disponíveis no Vault:

- `datajud_api_key`
- `rafael_email`
- `anthropic_api_key` (para chamadas à Claude API na Etapa 6)

> As credenciais do PJE e Eproc **não são usadas pelo Cowork** — o acesso ao browser pressupõe
> sessão já ativa pelo operador. Veja ETAPA 5 da skill para detalhes.

---

## Buscar histórico completo para classificação (Etapa 6)

```sql
SELECT
  m.codigo_cnj,
  m.nome_movimento,
  m.data_movimento,
  m.complemento_tabelado,
  m.complemento_livre,
  m.texto_despacho
FROM movimentacoes m
WHERE m.processo_id = '{processo_id}'
ORDER BY m.data_movimento DESC;
```
