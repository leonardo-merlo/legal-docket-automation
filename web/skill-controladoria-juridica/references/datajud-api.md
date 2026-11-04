# DataJud API — Referência Técnica

## Autenticação

A chave de API armazenada no Supabase Vault (chave: `datajud_api_key`) deve ser usada.
Formato do header:

```
Authorization: APIKey {datajud_api_key}
Content-Type: application/json
```

> A chave do CNJ é rotacionada periodicamente. Sempre recupere do Vault — nunca use
> uma chave hardcoded. Se a chave estiver expirada, você receberá HTTP 401 (veja
> tratamento de erros abaixo).

---

## Base URL

```
https://api-publica.datajud.cnj.jus.br
```

---

## Endpoints por Tribunal

| Sistema               | Tribunal | Índice             | Endpoint                         |
| --------------------- | -------- | ------------------ | -------------------------------- |
| PJE (estadual TJMG)   | TJMG     | `api_publica_tjmg` | `POST /api_publica_tjmg/_search` |
| Eproc TJMG (estadual) | TJMG     | `api_publica_tjmg` | `POST /api_publica_tjmg/_search` |
| Eproc TRF6 (federal)  | TRF6     | `api_publica_trf6` | `POST /api_publica_trf6/_search` |

> Tanto PJE quanto Eproc TJMG são tribunais estaduais de MG — ambos usam o mesmo índice TJMG.

---

## Query para buscar processo por número CNJ

O DataJud indexa o campo `numeroProcesso` usando o número **formatado com separadores** (hífens e pontos). Use sempre o número no formato CNJ original:

```json
POST https://api-publica.datajud.cnj.jus.br/api_publica_tjmg/_search
Authorization: APIKey {chave}
Content-Type: application/json

{
  "query": {
    "match": {
      "numeroProcesso": "5287934-28.2025.8.13.0384"
    }
  }
}
```

> **Não remova** os hífens e pontos ao fazer a query. O formato de 20 dígitos sem separadores (`52879342820258130384`) é usado apenas como identificador interno — a busca pelo campo `numeroProcesso` espera o número formatado.

### O que fazer quando retorna HTTP 200 com `hits.total.value = 0`

Isso indica que o processo ainda **não está indexado no DataJud**. O DataJud possui lag de 1 a 2 semanas em relação ao PJE/Eproc em tempo real. É normal para processos recentes ou com movimentação muito recente.

**Ação:** registre `observacoes = 'Processo não encontrado no DataJud (possível lag de indexação)'` na tabela `processos`, **não marque como erro**, e siga diretamente para a Etapa 5 (browser) para extrair os dados.

---

## Estrutura da Resposta

```json
{
  "hits": {
    "total": { "value": 1 },
    "hits": [
      {
        "_source": {
          "numeroProcesso": "0000001-11.2020.8.13.0001",
          "tribunal": "TJMG",
          "dataAjuizamento": "2020-01-15T00:00:00",
          "orgaoJulgador": { "nome": "1ª Vara Cível de Belo Horizonte" },
          "partes": [
            { "nome": "João Silva", "polo": "ATIVO" },
            { "nome": "Empresa XYZ S.A.", "polo": "PASSIVO" }
          ],
          "movimentos": [
            {
              "codigo": 848,
              "nome": "Julgamento",
              "dataHora": "2024-11-20T14:30:00",
              "complementosTabelados": [
                {
                  "codigo": 3,
                  "nome": "Procedente",
                  "descricao": "Pedido julgado procedente"
                }
              ],
              "complementos": [
                { "nome": "observacao", "descricao": "Texto livre do despacho" }
              ]
            }
          ],
          "assuntos": [
            { "codigo": 10431, "nome": "Indenização por Dano Material" }
          ],
          "classe": { "codigo": 7, "nome": "Ação de Procedimento Ordinário" }
        }
      }
    ]
  }
}
```

---

## Mapeamento para tabela `processos` (Etapa 4)

| Campo DataJud                              | Campo Supabase      |
| ------------------------------------------ | ------------------- |
| `partes[]` filtrado por `polo = 'ATIVO'`   | `polo_ativo`        |
| `partes[]` filtrado por `polo = 'PASSIVO'` | `polo_passivo`      |
| `orgaoJulgador.nome`                       | `vara`              |
| (extraído de `orgaoJulgador.nome`)         | `comarca`           |
| `classe.nome`                              | `classe_processual` |
| `dataAjuizamento`                          | `data_ajuizamento`  |

## Mapeamento para tabela `movimentacoes` (Etapa 4)

| Campo DataJud                                    | Campo Supabase                       |
| ------------------------------------------------ | ------------------------------------ |
| `movimentos[].codigo`                            | `codigo_cnj` (chave de deduplicação) |
| `movimentos[].nome`                              | `nome_movimento`                     |
| `movimentos[].dataHora`                          | `data_movimento`                     |
| `movimentos[].complementosTabelados[].descricao` | `complemento_tabelado`               |
| `movimentos[].complementos[].descricao`          | `complemento_livre`                  |
| `_source.orgaoJulgador.nome`                     | `orgao_julgador`                     |

---

## Tratamento de Erros da API

| HTTP Status | Ação                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200         | Processar normalmente                                                                                                                                                                                         |
| 404         | Processo não encontrado no DataJud — registre em `observacoes` e continue                                                                                                                                     |
| 401         | Chave expirada ou inválida — registre em `observacoes`, notifique o Rafael via e-mail indicando que a `datajud_api_key` no Vault precisa ser renovada, e continue o fluxo usando apenas o browser (Etapa 5) |
| 429         | Rate limit — aguarde 10 segundos e tente novamente (máx. 3 tentativas)                                                                                                                                        |
| 5xx         | Erro no servidor DataJud — registre e continue para o próximo processo                                                                                                                                        |

---

## Deduplicação de Movimentações

Antes de inserir cada movimentação, execute:

```sql
SELECT id FROM movimentacoes
WHERE processo_id = {processo_id}
  AND codigo_cnj = {codigo_do_movimento}
LIMIT 1;
```

Se retornar resultado, **não insira** — a movimentação já existe.
