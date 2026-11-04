## Edição manual de processo fora da fila

**Pedido do Rafael, 18/08/2026.** Ele quer começar a usar o painel no dia a
dia, e hoje não consegue: processo em `erro_browser` ou `pendente` não tem
rascunho, e sem rascunho não há o que editar. Ele fica esperando uma extração
que, no caso do certificado digital, não vai acontecer nunca.

Decisões tomadas com o Leonardo em 19/08/2026, registradas aqui porque as três
tinham alternativa razoável.

---

### O que foi decidido

**A edição manual tira o processo da fila.** Não é o robô e o gestor escrevendo
no mesmo lugar: quem assume, assume. O caminho de volta existe, e avisa.

**O erro continua visível.** O `motivo_ignorado` não é apagado — o Rafael
assumiu o processo *por causa* daquele erro, e esconder o motivo tiraria da tela
justamente o que explica por que ele está preenchendo na mão.

**Só o gestor.** Mesmo critério dos checklists.

**Os campos são os mesmos que ele já edita** nos processos extraídos: status
sugerido, texto da próxima ação, responsável, prazo fatal, prazo interno, alerta,
justificativa e passo a passo. Nenhuma tela nova de edição — a que existe passa a
receber um rascunho vazio.

---

### Como funciona

1. O gestor abre um processo que não está `processado` e clica em **Tratar na
   mão**.
2. O `pje_status` vira `tratado_manual`. A fila do agente busca só `pendente`,
   `erro_browser` e `captcha_bloqueado`, então ele sai da fila **sem nenhuma
   mudança no runner**.
3. Um rascunho é criado com `modelo_ia` nulo e `status` `pendente`. Se já existir
   um rascunho pendente (extração antiga que deu certo e voltou à fila depois),
   ele é reaproveitado — criar um segundo esconderia o primeiro, porque a página
   carrega só o mais recente.
4. A tela de edição que já existe destrava, com todos os campos vazios.
5. O gestor preenche e **aprova pelo botão normal**. A aprovação é o que cria a
   `tarefa` — ver a ressalva abaixo.
6. **Devolver para a fila** volta o status para `pendente`, com confirmação na
   tela: a partir dali a extração pode sobrescrever.

Tudo entra em `revisoes_rascunho`, como qualquer outra edição.

---

### O que mudou depois de ler o código

**"O rascunho manual nasce aprovado" foi descartado.** Era a recomendação
original e o Leonardo aprovou, mas ler `aprovarRascunho` mostrou que é a
aprovação que cria a linha em `tarefas` — e é a tarefa que faz o prazo aparecer
em `/tarefas`. Nascer aprovado pularia esse passo e produziria um prazo que
existe no rascunho e nunca chega na tela de tarefas de ninguém: silencioso, e o
pior desfecho possível num controle de prazo.

Fica um clique a mais (preencher → Aprovar), pelo caminho que já está testado.
Se incomodar, a saída é a aprovação automática **chamando o mesmo código** que
cria a tarefa, não um atalho paralelo.

**A exclusão das métricas já estava resolvida por construção.** O custo médio só
soma rascunho com `custo_usd` não nulo, e só de processo `processado` — o
rascunho manual não entra por nenhum dos dois caminhos. O que precisou mudar foi
outra coisa: `jaTeveSuaVez` passa a devolver `false` para `tratado_manual`, senão
o processo ficaria para sempre no denominador da taxa de extração, piorando a
taxa justamente quando alguém resolveu o problema.

**O vocabulário de `pje_status` estava duplicado em quatro telas**, cada uma
conhecendo um subconjunto diferente. Foi centralizado em `lib/status.ts` — sem
isso, `tratado_manual` apareceria cru em três lugares.

---

### O que precisou mudar no agente

Uma coisa só, e não é opcional: `inserir_processos_pendentes` grava
`pje_status = 'pendente'` ao reencontrar um CNJ que já existe. Uma publicação
nova de um processo assumido na mão desligaria o tratamento manual **sozinho**, e
o Rafael veria o toggle voltar sem ninguém ter mexido. Corrigido em
`motivo_de_nao_reinserir`, com teste.

---

### Aviso de publicação nova (decidido em 19/08)

Um processo tratado na mão sai da fila, mas continua andando no tribunal — e o
Rafael deixou de acompanhá-lo pelo painel de pendências justamente por ter
assumido. Sem aviso, publicação nova chegava e ninguém ficava sabendo.

Quando o CNJ é reencontrado e pulado, o agente escreve em
`processos.observacoes`:

```
Publicação nova em 19/08/2026 — processo tratado na mão, não voltou para a fila.
```

Mais recente primeiro, a mesma pauta não entra duas vezes, e o campo guarda no
máximo 10 linhas (uma por dia de pauta, cerca de duas semanas).

**Por que `observacoes` e não uma coluna nova:** o campo já existe, já é lido em
três telas do painel — a caixa âmbar da página do processo, a lista da entrada e
o cartão do dashboard — e **não era escrito por ninguém**. Escrever ali fez o
aviso aparecer nos três lugares sem uma linha de mudança no painel e sem
migração.

---

### Perguntas em aberto

**Não existe volta para "erro".** Devolver à fila devolve como `pendente`. Se ele
quiser reabrir o processo mantendo o registro de que a extração falhou, isso
precisa de outro caminho.
