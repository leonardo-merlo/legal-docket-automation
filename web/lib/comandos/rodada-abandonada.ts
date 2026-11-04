// Quando o agente morre no meio de uma rodada, ninguém encerra o comando: ele
// fica 'em_andamento' para sempre. Passado este tempo sem notícia, a rodada é
// dada como abandonada e deixa de contar como ativa.
//
// O número tem de ser o MESMO em três lugares: aqui, no POST de
// app/api/comandos/route.ts e em LIMITE_RODADA_ABANDONADA_MIN no agente.py, no
// repo do agente. Se a API liberar antes do agente, o comando novo nasce
// bloqueado do lado de lá.
//
// Até 08/09/2026 a regra existia só dentro do POST, e o GET — que é quem o
// painel consulta a cada 3s — não a conhecia. A rodada de 31/08 morreu sem
// encerrar, o GET devolveu 'em_andamento' por oito dias e os dois botões
// ficaram desabilitados esse tempo todo. O POST teria aceitado o clique; ele
// nunca chegou lá, porque o botão estava cinza. Por isso a regra virou função
// compartilhada, e não constante copiada: foi a cópia que divergiu.
export const LIMITE_RODADA_ABANDONADA_MIN = 90

/** Status em que um comando ainda ocupa o agente local. */
export const STATUS_ATIVOS: readonly string[] = ['pendente', 'em_andamento']

/**
 * Data-limite para o filtro do lado do banco (`.gte('atualizado_em', ...)`).
 * Comando ativo mais velho que isto não conta mais.
 */
export function limiteAbandonoIso(agora: Date = new Date()): string {
  return new Date(agora.getTime() - LIMITE_RODADA_ABANDONADA_MIN * 60_000).toISOString()
}

/**
 * Esta rodada travou sem ninguém encerrar? Função pura.
 *
 * `agora` é parâmetro para o comportamento poder ser conferido sem esperar 90
 * minutos de relógio.
 *
 * Carimbo ilegível conta como abandonada de propósito: quem impede duas rodadas
 * concorrentes é o POST, que checa no banco. Aqui o custo de errar para o lado
 * permissivo é um clique que a API recusa com 409; o de errar para o lado
 * restritivo é o botão travado para sempre, que é justamente o defeito de 31/08.
 */
export function rodadaAbandonada(
  status: string,
  atualizadoEm: string,
  agora: Date = new Date()
): boolean {
  if (!STATUS_ATIVOS.includes(status)) return false
  const atualizado = new Date(atualizadoEm).getTime()
  if (Number.isNaN(atualizado)) return true
  return agora.getTime() - atualizado > LIMITE_RODADA_ABANDONADA_MIN * 60_000
}
