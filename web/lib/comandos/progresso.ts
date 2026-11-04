// O progresso da rodada sai dos eventos que o agente já grava em
// eventos_extracao, e não de um campo novo no comando: assim o painel mostra
// "7 de 17" sem o agente precisar ser atualizado nas máquinas.
//
// - 'previvo.inicio' traz o tamanho da fila em dados.cnjs
// - cada 'cnj.fim' é um processo terminado (com ou sem erro)

export type EventoProgresso = {
  etapa: string
  dados: unknown
}

export type Progresso = {
  feitos: number
  total: number
}

function totalDaFila(dados: unknown): number | null {
  if (typeof dados !== 'object' || dados === null || !('cnjs' in dados)) return null
  const cnjs = (dados as { cnjs: unknown }).cnjs
  return typeof cnjs === 'number' && cnjs > 0 ? cnjs : null
}

/** Null enquanto o agente ainda não montou a fila (abrindo Chrome, conferindo abas). */
export function resumirProgresso(eventos: readonly EventoProgresso[]): Progresso | null {
  let total: number | null = null
  let feitos = 0
  for (const evento of eventos) {
    if (evento.etapa === 'previvo.inicio') total = totalDaFila(evento.dados) ?? total
    if (evento.etapa === 'cnj.fim') feitos += 1
  }
  if (total === null) return null
  return { feitos: Math.min(feitos, total), total }
}

/** "4 min", "1 h 05 min" — o painel atualiza a cada segundo, mas segundos só distraem. */
export function formatarDuracao(inicioIso: string, agora: Date = new Date()): string {
  const inicio = new Date(inicioIso).getTime()
  if (Number.isNaN(inicio)) return ''
  const minutos = Math.max(0, Math.floor((agora.getTime() - inicio) / 60_000))
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${String(minutos % 60).padStart(2, '0')} min`
}
