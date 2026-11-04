// Avisos antes de aprovar um rascunho. Só pedem confirmação, nunca bloqueiam:
// o gestor pode ter motivo para aprovar uma análise antiga ou criar uma segunda
// tarefa. O que não pode é fazer isso sem perceber.

/** "16/10" a partir de YYYY-MM-DD. */
function diaMes(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

/** "23/10/2026" a partir de YYYY-MM-DD. */
function dataCompleta(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

/**
 * Ordem dos rascunhos de um processo. `data_extracao` vem antes de
 * `data_criacao` porque, até 17/10/2026, o robô reescrevia o rascunho pendente e
 * só a primeira mudava.
 */
export function momentoDoRascunho(rascunho: { data_extracao: string | null; data_criacao: string | null }): string {
  return rascunho.data_extracao ?? rascunho.data_criacao ?? ''
}

export interface ContextoAprovacao {
  /** Pauta (YYYY-MM-DD) que este rascunho analisou. */
  pauta: string | null
  ehMaisRecente: boolean
  /** Pauta do rascunho mais recente do processo, quando não é este. */
  pautaMaisRecente: string | null
  /** Publicação atual do processo: a pauta mais nova e o estado dela. */
  publicacaoAtual: { pauta: string; status: string | null } | null
  /** AGUARDAR não cria tarefa, então o aviso de tarefa aberta não se aplica. */
  criaTarefa: boolean
  tarefasAbertas: { responsavel: string; prazoFatal: string | null }[]
}

export function avisosDeAprovacao(contexto: ContextoAprovacao): string[] {
  const avisos: string[] = []
  const pauta = contexto.pauta

  if (pauta && !contexto.ehMaisRecente && contexto.pautaMaisRecente) {
    avisos.push(
      `Esta análise é de ${diaMes(pauta)} e existe uma mais recente, de ${diaMes(contexto.pautaMaisRecente)}. Aprovar mesmo assim?`
    )
  }

  const atual = contexto.publicacaoAtual
  if (pauta && contexto.ehMaisRecente && atual && atual.pauta > pauta && atual.status !== 'processado') {
    avisos.push(
      `Esta análise é de ${diaMes(pauta)} e o processo teve publicação nova em ${diaMes(atual.pauta)}, ainda não analisada. Aprovar mesmo assim?`
    )
  }

  if (contexto.criaTarefa) {
    for (const tarefa of contexto.tarefasAbertas) {
      const prazo = tarefa.prazoFatal ? dataCompleta(tarefa.prazoFatal) : 'sem prazo definido'
      avisos.push(
        `Este processo já tem uma tarefa aberta com ${tarefa.responsavel}, prazo ${prazo}. Criar outra mesmo assim?`
      )
    }
  }

  return avisos
}
