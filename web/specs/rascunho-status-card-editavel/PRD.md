# PRD: Status sugerido editável (lista expandida) + card de sugestão editável + auditoria de edição manual

> Gerado em: 2026-07-23
> Feature: rascunho-status-card-editavel
> Status: rascunho — aguardando revisão

## Contexto

### O que precisa ser feito

No painel de revisão de rascunhos (`/processos/[id]`), o Rafael quer:

1. Editar o campo **Status sugerido** com uma lista de opções bem mais ampla do que as 5 atuais
   (Contestação, Sentença/Acordo, Execução, Aguardar, Manifestar) — adicionando 16 novas opções
   (Apelação, Agravo de Instrumento, Embargos de Declaração, Recurso Especial, Recurso Extraordinário,
   Contrarrazões, Contrarrazões e Recurso Adesivo, Petição, Petição Provas, Comprovar hipossuficiência,
   Emenda à Inicial, Juntar Documentos, Cumprimento de Sentença, Ciência, Alegações Finais, Réplica).
   "Contestação" já existe hoje e não será duplicada.
2. Editar o texto do card de sugestão no topo (`proxima_acao`, ex: "SANEAR IRREGULARIDADES NA CERTIDÃO
   DE TRIAGEM até 27/07/2026..."). As tags do card (cenário do prazo e classificação de risco)
   **permanecem não editáveis** — decisão confirmada com o usuário.
3. Registrar que um campo foi editado manualmente (flag + timestamp por campo), tanto no banco
   quanto visível na interface, para permitir análise futura de quais sugestões da IA precisaram
   de correção humana — isso vai alimentar aprendizado do sistema depois.

### Por que agora

O escritório está usando o painel ativamente para revisar rascunhos gerados pela IA. O status
sugerido hoje só cobre 5 cenários, mas a prática jurídica do escritório envolve muito mais tipos de
atos processuais — o Rafael frequentemente precisa reclassificar manualmente. Capturar essas
correções é o primeiro passo para depois retreinar/ajustar os prompts de classificação da IA.

## Referências encontradas

### No codebase

- `app/processos/[id]/RascunhoDetalhe.tsx` — client component que renderiza o card completo
  (tags, texto de sugestão, status/responsável/prazos, observações) e o formulário de edição.
  `STATUS_OPTIONS` (linhas 14-20) e `STATUS_LABEL` (linhas 22-28) são a lista de status hoje —
  ponto único a expandir no frontend para este arquivo (é o único formulário de edição realmente
  em uso).
- `app/processos/[id]/actions.ts` — Server Action `editarRascunho` (linhas 89-112) já persiste
  `status_sugerido`, `responsavel_sugerido_id`, `prazo_fatal_dias_uteis`, `prazo_interno_dias_uteis`
  via `update()` direto na tabela `rascunhos` usando `createAdminClient()` (service role). Padrão
  a estender: adicionar `proxima_acao` ao objeto de campos e a lógica de diff para auditoria.
- Tabela `rascunhos` (schema live, sem migrations versionadas no repo) — coluna `status_sugerido`
  é `text` com `CHECK (status_sugerido = ANY (ARRAY['CONTESTACAO','SENTENCA_ACORDO','EXECUCAO',
  'AGUARDAR','MANIFESTAR']))`. Não é um enum verdadeiro do Postgres.
- `app/dashboard/RascunhoCard.tsx` e `app/dashboard/actions.ts::atualizarStatusRascunho` — código
  duplicado/paralelo (STATUS_OPTIONS e lógica de aprovação repetidas), mas **não referenciado por
  nenhuma rota ativa** (confirmado por busca no repo inteiro). Fora do escopo — não serão tocados.
- `app/processos/[id]/page.tsx` — tem seu próprio `STATUS_LABEL` (linhas 15-21), mas é usado para
  `processo.status_atual` (coluna diferente, com CHECK mais amplo incluindo PENDENTE/EM_ANDAMENTO/
  ARQUIVADO). `aprovarRascunho` não propaga `status_sugerido` para `processo.status_atual` —
  portanto este arquivo não precisa mudar.
- Não existe login individual por advogado hoje (`middleware.ts` só faz refresh de sessão, sem
  redirecionar). Não há como capturar "quem" editou automaticamente — confirmado com o usuário que
  a auditoria será apenas "o quê" e "quando", sem autor.

### Documentação oficial consultada

- Não foi necessária consulta externa — o padrão de Server Action + Supabase já está estabelecido
  no próprio código do projeto.

## Implicações técnicas

### Arquivos que serão afetados (estimativa)

- `app/processos/[id]/RascunhoDetalhe.tsx` — modificar: expandir `STATUS_OPTIONS`/`STATUS_LABEL`,
  adicionar campo de edição do texto (`proxima_acao`), exibir indicadores de "editado manualmente"
  no modo de visualização.
- `app/processos/[id]/actions.ts` — modificar: `editarRascunho` passa a aceitar `proxima_acao`,
  calcula diffs contra os valores atuais no banco e grava `campos_editados_manualmente` +
  `editado_manualmente_em`.
- `lib/supabase/types.ts` — modificar (regenerar tipos após migration, via
  `mcp__supabase__generate_typescript_types` ou manualmente): novas colunas `campos_editados_manualmente`
  e `editado_manualmente_em` na tabela `rascunhos`.
- Migration no Supabase (via MCP `apply_migration`) — criar: altera o CHECK constraint de
  `status_sugerido` para incluir os 16 novos valores e adiciona as duas colunas de auditoria.

### Dependências externas

- [ ] Nenhuma lib nova.
- [ ] Nenhuma variável de ambiente nova.
- [ ] Nenhum serviço externo novo.

## Implicações de segurança

### Superfície de ataque

- [ ] Expõe dados ao cliente? Não além do que já é exposto (campos da própria tabela `rascunhos`,
      já lida e exibida hoje).
- [ ] Recebe input do usuário? Sim — texto livre do campo `proxima_acao` (textarea) e seleção de
      `status_sugerido` (select, restrito às opções do CHECK constraint). O texto livre já é
      persistido sem sanitização especial hoje (mesmo padrão de `justificativa`/`alerta`, que são
      gerados pela IA e exibidos como texto simples via JSX — sem `dangerouslySetInnerHTML`, sem
      risco de XSS). Sem mudança de padrão de segurança aqui.
- [ ] Requer autenticação? Não (mesmo padrão atual — painel interno, sem login individual).
- [ ] Requer autorização específica? Não (mesmo padrão atual).
- [ ] Envolve upload? Não.
- [ ] Recebe webhook? Não.

### Decisões de thin client / fat server

- O diff (comparar valores antigos vs. novos para decidir o que marcar como "editado") acontece
  **inteiramente na Server Action** (`editarRascunho`), que já busca o estado atual do banco antes
  de gravar. O client só envia os valores finais dos campos — não decide o que foi ou não editado.
- A lista de status (`STATUS_OPTIONS`) fica no client (é puramente apresentacional, sem lógica de
  negócio), mas os valores válidos continuam sendo a fonte de verdade do banco via CHECK constraint
  — se o client mandar um valor fora da lista, o `update()` falha com erro de constraint.

## Fora do escopo desta feature

- Tornar as tags do card (`cenario_prazo`, `classificacao_risco`) editáveis — confirmado com o
  usuário que só o texto (`proxima_acao`) será editável nesta rodada.
- Identificar **quem** editou (autor) — não há login individual hoje; confirmado com o usuário que
  a auditoria registra apenas "o quê" e "quando".
- Histórico completo de valor antigo → novo por edição — confirmado com o usuário que o escopo é
  flag booleana + timestamp por campo, não um log de histórico versionado.
- Atualizar `app/dashboard/RascunhoCard.tsx` e `app/dashboard/actions.ts` — código não referenciado
  por nenhuma rota ativa hoje; consolidar/tocar esse código morto fica fora desta task.
- Propagar `status_sugerido` para `processo.status_atual` — não é o comportamento atual do sistema
  e não foi pedido.
