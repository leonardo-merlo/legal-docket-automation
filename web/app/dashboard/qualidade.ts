// Quanto se pode confiar na análise da IA, medido pelo que o Rafael fez com
// ela — não por nota que ele tenha dado.
//
// De propósito são contagens absolutas, e não porcentagem: nas primeiras semanas
// do piloto o denominador é pequeno, e "73% de acerto" sobre 11 rascunhos oscila
// 9 pontos a cada clique. Três números inteiros descrevem a mesma realidade sem
// fingir precisão que não existe.

export type RevisaoLinha = {
  rascunho_id: string
  acao: string
  motivos: string[]
}

export interface Qualidade {
  aprovadosDireto: number
  aprovadosComEdicao: number
  rejeitados: number
  /** Rascunhos com alguma revisão registrada. Zero = nada medido ainda. */
  totalRevisados: number
  /** Motivos de mudança, do mais frequente para o menos. */
  motivos: { motivo: string; total: number }[]
}

/**
 * As revisões chegam como histórico bruto: um mesmo rascunho pode ter várias
 * linhas (editado, editado de novo, aprovado). O que classifica o rascunho é o
 * destino final; a edição pelo caminho é o que separa "aprovado direto" de
 * "aprovado com edição".
 *
 * Rejeitado vence aprovado quando os dois aparecem: se ele voltou atrás e
 * rejeitou, a análise não servia — e é isso que precisa ser contado.
 */
export function calcularQualidade(revisoes: RevisaoLinha[]): Qualidade {
  const porRascunho = new Map<string, { editado: boolean; aprovado: boolean; rejeitado: boolean }>()
  const contagemMotivos = new Map<string, number>()

  for (const revisao of revisoes) {
    const atual = porRascunho.get(revisao.rascunho_id) ?? {
      editado: false, aprovado: false, rejeitado: false,
    }
    if (revisao.acao === 'editado') atual.editado = true
    if (revisao.acao === 'aprovado') atual.aprovado = true
    if (revisao.acao === 'rejeitado') atual.rejeitado = true
    porRascunho.set(revisao.rascunho_id, atual)

    for (const motivo of revisao.motivos) {
      contagemMotivos.set(motivo, (contagemMotivos.get(motivo) ?? 0) + 1)
    }
  }

  let aprovadosDireto = 0
  let aprovadosComEdicao = 0
  let rejeitados = 0

  for (const estado of porRascunho.values()) {
    if (estado.rejeitado) {
      rejeitados++
    } else if (estado.aprovado) {
      if (estado.editado) aprovadosComEdicao++
      else aprovadosDireto++
    }
    // Rascunho só editado, ainda sem decisão, não entra em nenhuma das três:
    // contá-lo como acerto ou erro seria julgar o que ainda está em revisão.
  }

  const decididos = aprovadosDireto + aprovadosComEdicao + rejeitados

  return {
    aprovadosDireto,
    aprovadosComEdicao,
    rejeitados,
    totalRevisados: decididos,
    motivos: Array.from(contagemMotivos.entries())
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total || a.motivo.localeCompare(b.motivo)),
  }
}
