// Desde 10/2026 o agente local roda em mais de um computador (Rafael e
// Marina). Cada navegador guarda qual computador ele é, e o pedido do painel vai
// para o agente daquele computador — antes o primeiro agente ligado pegava
// qualquer pedido, e a extração podia abrir no Chrome do outro.
//
// O agente avisa que está vivo a cada 30s (INTERVALO_PRESENCA_S no agente.py).
// Quatro batimentos perdidos e ele conta como desligado.
export const LIMITE_PRESENCA_S = 120

export type Agente = {
  id: string
  nome: string
  visto_em: string
}

export function agenteLigado(vistoEm: string, agora: Date = new Date()): boolean {
  const visto = new Date(vistoEm).getTime()
  if (Number.isNaN(visto)) return false
  return agora.getTime() - visto <= LIMITE_PRESENCA_S * 1000
}

/**
 * Como o painel chama o computador. O nome nasce do usuário do Windows, e dois
 * computadores podem ter o mesmo ("User") — aí o id do Windows desempata.
 */
export function rotuloDoAgente(agente: Agente, todos: readonly Agente[]): string {
  const repetido = todos.filter((outro) => outro.nome === agente.nome).length > 1
  return repetido ? `${agente.nome} (${agente.id})` : agente.nome
}

export function acharAgente(id: string | null, todos: readonly Agente[]): Agente | null {
  if (!id) return null
  return todos.find((agente) => agente.id === id) ?? null
}
