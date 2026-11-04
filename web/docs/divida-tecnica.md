## Dívida técnica

Problemas conhecidos que não foram corrigidos, com o motivo de terem ficado para
depois. Cada item diz o que está errado, o que pode acontecer por causa disso e
o que precisa ser feito.

Ao resolver um item, remova a seção inteira em vez de marcá-la como concluída —
o histórico fica no git.

### Rota `/api/rascunhos/atualizar-status` aprova sem criar tarefa

Aberto em 06/08/2026.

`app/api/rascunhos/atualizar-status/route.ts` recebe POST e grava
`rascunhos.status` com qualquer valor que vier no body. É um caminho paralelo ao
Server Action `aprovarRascunho` / `rejeitarRascunho` de
`app/processos/[id]/actions.ts`, mas sem nada do que o Server Action faz junto:

- não cria a tarefa quando aprova, então o prazo some da fila sem responsável;
- não copia `proxima_acao` para o processo;
- não registra nada em `revisoes_rascunho`, então a aprovação não entra no bloco
  "Qualidade da análise" do dashboard e some da estatística do piloto.

Risco prático hoje é baixo: nenhum arquivo do projeto chama essa rota (conferido
por busca em 06/08/2026) e ela exige sessão de gestor. Ficou para depois do
piloto por isso — mexer na semana de teste custaria mais do que o problema vale.

O que fazer: confirmar que nada externo ao repo faz POST nela (histórico do git,
skills e scripts fora do projeto) e então remover a rota. Se aparecer algum
consumidor, fazê-la chamar a mesma lógica do Server Action em vez de escrever
direto na tabela.

### `schema.sql` não reflete mais o banco

Aberto em 06/08/2026. O arquivo fica no repo do agente
(`controladoria-playwright/schema.sql`) e serve de bootstrap: a instrução é colar
o conteúdo no SQL Editor de um projeto Supabase novo. Hoje isso produziria um
banco incompleto, e o erro só apareceria em uso.

Faltam, entre outras coisas: `processos.duracao_extracao_s`; em `rascunhos` as
colunas `custo_usd`, `tokens_entrada`, `tokens_saida`,
`campos_editados_manualmente`, `editado_manualmente_em` e `checklist_editado`;
`usuarios.auth_user_id`; as tabelas `checklists_modelo`, `checklist_itens` e
`revisoes_rascunho`; a function `buscar_processos_cnj`. O CHECK de
`status_sugerido` lista 5 status onde o banco aceita 21.

O que fazer: ler o schema real pelo MCP do Supabase e reescrever o arquivo para
bater com produção, mantendo o estilo atual (seções numeradas, comentários em
português, RLS no fim). Não altera o banco — é só o arquivo.

### Ingestão via Gmail API: o que precisa estar resolvido antes do modo ativo

Aberto em 08/10/2026, na implementação da ingestão (plano
`docs/superpowers/plans/2026-09-10-ingestao-gmail-api.md`). Nada disso afeta o modo
sombra, que só lê e guarda o e-mail. Tudo afeta o modo ativo, que grava em `processos`.

- **Remetente pode ser forjado.** `remetenteAceito` (`lib/gmail/config.ts`) confia só
  no header `From`. Um e-mail falso com assunto de pauta gravaria CNJs e devolveria
  processos para `pendente`. Antes de ativar: exigir `dkim=pass` ou `dmarc=pass` no
  domínio do remetente, lendo o header `Authentication-Results`.
- **Pauta sem data fica parada sem aviso.** Se o parser não acha o `lote_id`, o e-mail
  vira `antes_do_corte` e nunca é aplicado (`lib/gmail/sincronizar.ts`). Precisa de
  alerta no painel.
- **Reaplicar e-mail já aplicado.** `aplicar_email_ids` aceita um e-mail com status
  `aplicado` e manda os CNJs dele de volta para `pendente`. Recusar quem já está
  `aplicado`.
- **Gravações sem conferência de erro.** As atualizações de `integracao_gmail` no fim da
  rodada e a marcação `aplicado` não checam o erro do Supabase. A marcação falhando
  deixa o e-mail `pendente`, e a próxima rodada aplica de novo.
- **Limite de 10 linhas do aviso pode cortar anotação manual** em `observacoes`
  (`avisoPublicacaoIgnorada`). O `runner.py` tem o mesmo comportamento: corrigir nos
  dois juntos.

### Lint do painel já tinha erros antes da ingestão

Aberto em 08/10/2026. `npm run lint` acusa 3 erros `react-hooks/set-state-in-effect`
que já existiam (`app/dashboard/EntradasPorDia.tsx`,
`components/auth/definir-senha-form.tsx`, `components/botao-iniciar.tsx`). Também lê as
worktrees antigas em `.claude/worktrees/` (milhares de erros de build gerado). Na
ingestão, o critério de deploy passou a ser "nenhum erro novo". O que fazer: acrescentar
`.claude/**` aos `globalIgnores` do `eslint.config.mjs` e corrigir os 3 efeitos.

### Ingestão via Gmail API: pontos menores da revisão final

Aberto em 08/10/2026, na revisão antes do deploy em sombra.

- **Qualquer conta Google pode ser conectada.** `salvarConexao` não confere se o perfil é
  `gestor@exemplo-adv.example`. Se o gestor conectar a própria conta, a ingestão lê a caixa
  errada e o único sinal é o alerta de "último e-mail há X dias". O que fazer: aceitar só a
  conta esperada (variável de ambiente) e responder `?gmail=conta_errada`.
- **A mesma pauta pode entrar duas vezes**, se chegar pelos dois remetentes (original e
  encaminhada). Na sombra só confunde a comparação. No modo ativo, a segunda aplicação
  devolveria processos para `pendente`. Conferir na validação real; se acontecer, pular
  e-mail cujo `lote_id` já foi aplicado.
- **A validade do `state` do OAuth depende só do navegador** (`maxAge` do cookie). Opcional:
  guardar a hora de emissão no cookie e recusar no callback depois de 10 minutos.

### Ingestão via Gmail API: travas do modo ativo (09/10/2026)

Resolvido em 09/10/2026, ainda em modo sombra:

- **Remetente forjado:** `lib/gmail/autenticacao.ts` exige SPF, DKIM ou DMARC aprovado pelo
  Gmail no domínio do From. Vale só o primeiro `Authentication-Results`, e só se for do
  `mx.google.com`.
- **Pauta sem data:** gera alerta no painel.
- **Reaplicar:** a aplicação manual recusa e-mail já `aplicado`, e também um lido em sombra
  com remetente não autenticado.
- **Erros do banco:** o fim da rodada e a marcação `aplicado` conferem o erro do Supabase.
- **Aviso de 10 linhas:** o limite corta só avisos, nunca anotação. Corrigido no painel e no
  `runner.py`.
- **Conta errada:** o callback aceita só `GMAIL_CONTA_ESPERADA` (padrão
  `gestor@exemplo-adv.example`).
- **Pauta repetida:** o segundo e-mail da mesma data vira `pauta_repetida`, com alerta. Só
  conta a primeira pauta que leu algum CNJ.

Ainda aberto. **Bloqueia o modo ativo:**

- **A trava do remetente prova o encaminhamento, não a OAB.** A pauta chega pelo Microsoft
  365 do escritório. O SPF aprovado é desse encaminhamento, e a OAB não assina os e-mails
  (o M365 mede `spf=none; dkim=none` na origem). Quem mandar um e-mail forjado ao endereço
  público do escritório pode passar, se o M365 encaminhar.
  - Solução de verdade: regra de fluxo no M365 do escritório que só encaminhe ao Gmail o
    que vier de `oabmg@recortedigital.adv.br`. Isso é configuração do lado do cliente.
  - Limite de estrago, em código: teto de CNJs que uma pauta pode devolver à fila.
  - Decisão do Leonardo.

Ainda aberto, menores:

- **Duas rodadas ao mesmo tempo** (cron e botão) podem aplicar o mesmo e-mail duas vezes.
  Impacto baixo. Resolver com trava por rodada (coluna nova).
- **Marcação `aplicado` falhando** leva a gravar de novo na rodada seguinte. Só some com os
  CNJs e a marcação numa transação (função no Postgres).
- **Anotação manual que comece com "Publicação nova em "** conta como aviso e pode ser
  cortada. As anotações agora ficam abaixo dos avisos.
- **Conta errada no OAuth:** o refresh token da conta recusada não é revogado no Google.

## Publicações por pauta (17/10/2026)

O painel passou a contar por publicação (`publicacoes`), não por processo. Ficou para depois:

- **Aprovar o rascunho antigo de um processo que saiu de novo** continua possível. A tela
  avisa que a análise é da pauta anterior, mas não bloqueia. Se aprovar e depois a rodada
  refizer a análise, nasce um rascunho novo pendente para o mesmo processo.
- **Cartão "Motivos de falha"** ainda lê `processos` (o estado atual), não as publicações.
  Para o motivo de agora isso basta; não mostra falha de uma publicação antiga.
- **Histórico só desde 28/09**: antes disso a base foi zerada e o dia ficaria só com os
  processos que voltaram. Publicações refeitas sem nenhum rastro de tentativa foram
  marcadas `substituida` (13 casos).
- **Processo tratado na mão que sai de novo** continua sem publicação nova (a ingestão só
  deixa o aviso). É o comportamento de antes, mantido para não contar como falha algo que
  o robô nem tentou.
- **Lint**: `react-hooks/set-state-in-effect` em `app/dashboard/EntradasPorDia.tsx` (busca
  por CNJ) já falhava antes desta mudança.

## Vários rascunhos por processo (17/10/2026)

- **Caminhos de aprovação sem uso** (`atualizarStatusRascunho` em
  `app/dashboard/actions.ts` e a rota `api/rascunhos/atualizar-status`) não têm os
  avisos nem a pauta do rascunho no prazo. Ninguém chama hoje; apagar ou alinhar.
- **8 tarefas antigas sem "o que fazer"**: o processo delas não tinha texto, e não
  inventei um a partir do rascunho.
- **Editar a tarefa não muda mais o topo do processo**: o texto agora é da tarefa.
- **Tratar na mão** reaproveita o rascunho pendente mais recente, se houver, em vez de
  abrir outro vazio.
- **Tela do processo não foi vista logada** nesta mudança; conferida por tipos, testes
  e consultas no banco.
- **Corrigido em 17/10/2026:** na lista do dia, o aviso "já foi analisado na pauta de"
  buscava o rascunho anterior entre os de todos os processos do dia, e os 17 do dia 16
  apareciam com 15/10. Agora olha só o próprio processo (6 de 17 têm análise anterior).
