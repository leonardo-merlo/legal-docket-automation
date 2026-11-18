// Processos que o robô procura no RUPE toda rodada e não acha. Em 05/11/2026
// eram dez, cada um custando uns 2 minutos de rodada, e a sessão do PJe
// envelhecia esperando a vez. Depois de 6 rodadas o robô desiste sozinho
// (runner.contar_nao_localizado); daí em diante quem decide é o gestor.

/** O texto que o rupe_extractor.py grava quando a pesquisa volta vazia. */
export const MARCA_NAO_LOCALIZADO = 'não localizado no RUPE'

export interface ProcessoNaoLocalizado {
  id: string
  numero_cnj: string
  vara: string | null
  /** Quando o robô parou de procurar. `null` enquanto ele ainda tenta. */
  robo_desistiu_em: string | null
}

export interface FalhaNaoLocalizado {
  numero_cnj: string | null
  momento: string
}

export interface NaoLocalizado extends ProcessoNaoLocalizado {
  /** Rodadas em que a pesquisa voltou vazia, pelo histórico de extrações. */
  tentativas: number
  /** Momento da primeira delas. `null` se o histórico não tiver nenhuma. */
  desde: string | null
}

/**
 * Primeiro quem o robô desistiu de procurar: esse só anda se alguém decidir.
 * Depois, mais tentativas primeiro: é o que está travado há mais tempo.
 */
export function resumirNaoLocalizados(
  processos: ProcessoNaoLocalizado[],
  falhas: FalhaNaoLocalizado[],
): NaoLocalizado[] {
  const porCnj = new Map<string, { tentativas: number; desde: string }>()
  for (const falha of falhas) {
    if (!falha.numero_cnj) continue
    const atual = porCnj.get(falha.numero_cnj)
    if (!atual) {
      porCnj.set(falha.numero_cnj, { tentativas: 1, desde: falha.momento })
      continue
    }
    atual.tentativas++
    if (Date.parse(falha.momento) < Date.parse(atual.desde)) atual.desde = falha.momento
  }

  return processos
    .map((processo) => {
      const historico = porCnj.get(processo.numero_cnj)
      return { ...processo, tentativas: historico?.tentativas ?? 0, desde: historico?.desde ?? null }
    })
    .sort((a, b) =>
      Number(b.robo_desistiu_em !== null) - Number(a.robo_desistiu_em !== null)
      || b.tentativas - a.tentativas
      || a.numero_cnj.localeCompare(b.numero_cnj))
}
