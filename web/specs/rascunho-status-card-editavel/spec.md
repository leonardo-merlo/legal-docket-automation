# Spec: Status sugerido editável (lista expandida) + card de sugestão editável + auditoria de edição manual

> Gerado em: 2026-07-23
> PRD: `specs/rascunho-status-card-editavel/PRD.md`
> Status: aguardando revisão

## Visão geral

No formulário de edição do rascunho (`/processos/[id]`), o select de "Status sugerido" passa a
oferecer 21 opções (5 atuais + 16 novas) em vez de 5, e um novo campo de texto (`proxima_acao`)
permite editar a sugestão do card do topo. Toda vez que o Rafael salva uma edição, a Server
Action compara os valores enviados com os valores atuais no banco e marca, por campo, se houve
edição manual — isso fica visível tanto no banco (para análise futura) quanto no painel (badge
"editado" ao lado do campo).

**Thin client / fat server:**
- Server (`editarRascunho`): busca o estado atual do rascunho no banco, compara com os valores
  recebidos, decide quais campos mudaram, grava os novos valores + `campos_editados_manualmente`
  (lista dos campos alterados, união com edições anteriores) + `editado_manualmente_em`.
- Cliente (`RascunhoDetalhe.tsx`): só coleta input do usuário (select de status, textarea de
  sugestão, select de responsável, inputs de prazo) e exibe os badges de "editado" com base no
  array `campos_editados_manualmente` já vindo do banco — nenhuma lógica de diff no cliente.

## Comportamentos esperados

### Happy path

1. Rafael abre `/processos/[id]`, clica em "Editar".
2. No formulário, vê o select de Status sugerido com as 21 opções, um novo campo de texto
   "Texto da sugestão" pré-preenchido com `proxima_acao`, e os campos já existentes (Responsável,
   Prazo fatal, Prazo interno).
3. Altera o status para "Apelação" e ajusta o texto da sugestão. Clica em "Salvar".
4. A Server Action busca o rascunho atual, detecta que `status_sugerido` e `proxima_acao` mudaram
   (o resto ficou igual), grava os novos valores + `campos_editados_manualmente: ['status_sugerido',
   'proxima_acao']` (unindo com o que já estava marcado antes, se houver) + `editado_manualmente_em: now()`.
5. A página recarrega (`router.refresh()`) e o card em modo de visualização mostra "Apelação" como
   status, o novo texto no card do topo, e um pequeno indicador "editado manualmente" ao lado do
   status e do texto (não ao lado de responsável/prazos, que não mudaram desta vez).

### Edge cases

| Cenário | Comportamento esperado |
|---------|----------------------|
| Rafael clica em "Editar" e "Salvar" sem mudar nada | Nenhum campo é adicionado a `campos_editados_manualmente`, `editado_manualmente_em` não é atualizado (evita falso positivo de "editado" quando nada mudou). |
| Rafael edita o mesmo campo duas vezes em sessões diferentes | O campo permanece marcado como editado (união, não substituição) e `editado_manualmente_em` reflete a edição mais recente. |
| Valor de `status_sugerido` enviado não está nas opções do CHECK constraint | `update()` do Supabase retorna erro de constraint violation; a action lança erro com a mensagem já existente (`Erro ao salvar rascunho: ... (code: ...)`), exibido no formulário via `error` state — nada é gravado (comportamento já existente, mantido). |
| `proxima_acao` enviado vazio/só espaços | Permitido (mesmo padrão de "texto opcional" já usado para os outros campos) — grava string vazia/trimada; card do topo simplesmente não renderiza a caixa de texto se `proxima_acao` for falsy (comportamento já existente em `RascunhoDetalhe.tsx` linha 223). |
| Rascunho recém-criado, nunca editado (`campos_editados_manualmente` é `{}`/vazio) | Nenhum badge "editado" aparece — comportamento padrão. |
| Comparação de prazos (`prazo_fatal_dias_uteis`/`prazo_interno_dias_uteis`) | Comparar como número (ou `null`), não como string — evita falso positivo por causa de conversão de tipo entre o `<input type="number">` (string) e a coluna `integer`. |

### Estados de UI

- **Loading:** já existe — botão "Salvar" mostra spinner + "Salvando…" (`isPending && pendingAction === 'editar'`), mantido sem alteração.
- **Sucesso:** `router.refresh()` recarrega os dados do servidor; badges de "editado" aparecem nos campos que mudaram.
- **Erro:** mensagem de erro já existente (`{error}` em vermelho abaixo do formulário), mantida.
- **Vazio:** se `proxima_acao` estiver vazio no modo visualização, a caixa de texto do card simplesmente não é renderizada (comportamento já existente).

## Modelo de dados

### Tabelas afetadas

```sql
-- rascunhos: expandir CHECK constraint de status_sugerido e adicionar colunas de auditoria

alter table rascunhos drop constraint rascunhos_status_sugerido_check;

alter table rascunhos add constraint rascunhos_status_sugerido_check
  check (status_sugerido = any (array[
    'CONTESTACAO','SENTENCA_ACORDO','EXECUCAO','AGUARDAR','MANIFESTAR',
    'APELACAO','AGRAVO_INSTRUMENTO','EMBARGOS_DECLARACAO','RECURSO_ESPECIAL','RECURSO_EXTRAORDINARIO',
    'CONTRARRAZOES','CONTRARRAZOES_RECURSO_ADESIVO','PETICAO','PETICAO_PROVAS',
    'COMPROVAR_HIPOSSUFICIENCIA','EMENDA_INICIAL','JUNTAR_DOCUMENTOS','CUMPRIMENTO_SENTENCA',
    'CIENCIA','ALEGACOES_FINAIS','REPLICA'
  ]));

alter table rascunhos add column campos_editados_manualmente text[] not null default '{}';
alter table rascunhos add column editado_manualmente_em timestamptz;
```

- Queries principais:
  - `editarRascunho` faz um `select` dos valores atuais (`status_sugerido, responsavel_sugerido_id,
    prazo_fatal_dias_uteis, prazo_interno_dias_uteis, proxima_acao, campos_editados_manualmente`)
    antes do `update`, para calcular o diff.
  - `update` grava os campos novos + `campos_editados_manualmente` (união) + `editado_manualmente_em`
    (só quando houve pelo menos uma mudança real).

### RLS

Sem mudança — a tabela já tem RLS habilitado, mas todas as Server Actions usam `createAdminClient()`
(service role, bypassa RLS), mesmo padrão de hoje. Nenhuma política nova necessária.

## Segurança ← revisar com atenção

### Validação de input

- `status_sugerido`: restrito pelo `<select>` no client (só oferece as 21 opções válidas) **e**
  pelo CHECK constraint no banco (defesa em profundidade — mesmo se alguém chamar a Server Action
  diretamente com outro valor, o banco rejeita).
- `proxima_acao`: texto livre, sem schema Zod (mesmo padrão dos campos de texto já existentes no
  projeto, ex. `justificativa`/`alerta`, que também não têm validação Zod). Renderizado como texto
  simples via JSX (`{rascunho.proxima_acao}`), nunca via `dangerouslySetInnerHTML` — sem risco de XSS.
- `prazo_fatal_dias_uteis`/`prazo_interno_dias_uteis`: mesma validação já existente (`parseInt`,
  `min="1" max="365"` no input), sem mudança.
- Onde é validado: na Server Action (`editarRascunho`), antes do `update`.

### Autenticação

- Requerida: não (mesmo padrão atual — sem login individual, painel interno).

### Autorização

- Quem pode executar: qualquer pessoa com acesso ao painel (mesmo padrão atual, sem mudança).
- Como é verificada: não é verificada hoje — fora do escopo desta feature alterar isso.

### Dados sensíveis

- Nenhum dado novo sensível é introduzido. `campos_editados_manualmente` e `editado_manualmente_em`
  são metadados operacionais (nomes de campos + timestamp), não dados pessoais.

### Endpoints/webhooks expostos

- Nenhum novo. `editarRascunho` continua sendo uma Server Action (não uma API route pública).

## Arquivos a criar/modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| Migration Supabase (via `mcp__supabase__apply_migration`) | criar | Expande CHECK constraint de `status_sugerido` (+16 valores) e adiciona colunas `campos_editados_manualmente` (`text[]`) e `editado_manualmente_em` (`timestamptz`) na tabela `rascunhos`. |
| `lib/supabase/types.ts` | modificar | Regenerar tipos (via `mcp__supabase__generate_typescript_types`) para refletir as novas colunas. |
| `app/processos/[id]/actions.ts` | modificar | `editarRascunho` passa a aceitar `proxima_acao` no objeto de campos; busca estado atual, calcula diff, grava `campos_editados_manualmente` (união) e `editado_manualmente_em` condicionalmente. |
| `app/processos/[id]/RascunhoDetalhe.tsx` | modificar | Expande `STATUS_OPTIONS`/`STATUS_LABEL` com as 16 novas opções; adiciona textarea "Texto da sugestão" (`proxima_acao`) no formulário de edição; exibe badge "editado manualmente" nos campos presentes em `rascunho.campos_editados_manualmente` no modo de visualização, incluindo o texto do card do topo. |

## Dependências externas

- [ ] Nenhuma.

## Fora do escopo

- Tornar `cenario_prazo`/`classificacao_risco` (tags do card) editáveis — v2, se pedido depois.
- Capturar autor da edição (requer login individual) — v2, se o escritório decidir implementar login.
- Histórico completo (valor antigo → novo) por edição — v2, se a análise de aprendizado precisar de mais granularidade.
- Atualizar `app/dashboard/RascunhoCard.tsx` / `app/dashboard/actions.ts` (código não referenciado hoje).
