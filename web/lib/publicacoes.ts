// Uma publicação é um processo numa pauta. O mesmo processo pode sair em várias
// pautas; até 17/10/2026 a ingestão sobrescrevia a data e o estado da linha do
// processo, e o dia antigo perdia o processo que já tinha sido extraído. A tabela
// `publicacoes` guarda cada uma com o desfecho que teve.

/** Saiu de novo na pauta antes de ser tentada: a análise da seguinte cobre as duas. */
export const PJE_STATUS_SUBSTITUIDA = 'substituida'

export interface PublicacaoBase {
  id: string
  processo_id: string
  /** YYYY-MM-DD */
  pauta: string
  /** Quando entrou no sistema. É o que liga um rascunho à publicação que ele analisou. */
  criada_em: string
  pje_status: string | null
}

export interface PublicacaoResolvida<P extends PublicacaoBase> {
  publicacao: P
  /** O estado que conta: o da própria publicação, ou o da seguinte se ela foi substituída. */
  statusEfetivo: string | null
  /** Pauta da publicação cuja análise cobriu esta. `null` se não foi substituída. */
  analisadaCom: string | null
}

function porPauta(a: PublicacaoBase, b: PublicacaoBase): number {
  return a.pauta.localeCompare(b.pauta)
}

function agruparPorProcesso<P extends PublicacaoBase>(publicacoes: P[]): Map<string, P[]> {
  const grupos = new Map<string, P[]>()
  for (const publicacao of publicacoes) {
    const grupo = grupos.get(publicacao.processo_id) ?? []
    grupo.push(publicacao)
    grupos.set(publicacao.processo_id, grupo)
  }
  for (const grupo of grupos.values()) grupo.sort(porPauta)
  return grupos
}

/**
 * Publicação substituída herda o estado da seguinte do mesmo processo: o robô
 * nunca tentou ela sozinha, e a análise da seguinte leu os mesmos autos. Sem
 * isto ela ficava "pendente" para sempre num dia que já passou.
 */
export function resolverPublicacoes<P extends PublicacaoBase>(publicacoes: P[]): Map<string, PublicacaoResolvida<P>> {
  const resolvidas = new Map<string, PublicacaoResolvida<P>>()
  for (const grupo of agruparPorProcesso(publicacoes).values()) {
    let seguinte: PublicacaoResolvida<P> | null = null
    for (let i = grupo.length - 1; i >= 0; i--) {
      const publicacao = grupo[i]
      const substituida = publicacao.pje_status === PJE_STATUS_SUBSTITUIDA && seguinte !== null
      const resolvida: PublicacaoResolvida<P> = {
        publicacao,
        statusEfetivo: substituida ? seguinte!.statusEfetivo : publicacao.pje_status,
        analisadaCom: substituida ? (seguinte!.analisadaCom ?? seguinte!.publicacao.pauta) : null,
      }
      resolvidas.set(publicacao.id, resolvida)
      seguinte = resolvida
    }
  }
  return resolvidas
}

export interface RascunhoBase {
  id: string
  processo_id: string
  data_extracao: string | null
  data_criacao: string | null
}

/**
 * rascunho → publicação que ele analisou: a mais recente que já existia quando
 * o rascunho foi gravado. Rascunho anterior a todas (não deveria acontecer) fica
 * com a primeira. `data_extracao` vem antes de `data_criacao` porque o agente
 * reescreve o rascunho pendente numa reanálise e só atualiza a primeira.
 */
export function atribuirRascunhos(publicacoes: PublicacaoBase[], rascunhos: RascunhoBase[]): Map<string, string> {
  const grupos = agruparPorProcesso(publicacoes)
  const dono = new Map<string, string>()
  for (const rascunho of rascunhos) {
    const grupo = grupos.get(rascunho.processo_id)
    if (!grupo || grupo.length === 0) continue
    const momento = Date.parse(rascunho.data_extracao ?? rascunho.data_criacao ?? '')
    let escolhida = grupo[0]
    if (!Number.isNaN(momento)) {
      for (const publicacao of grupo) {
        if (Date.parse(publicacao.criada_em) <= momento) escolhida = publicacao
      }
    }
    dono.set(rascunho.id, escolhida.id)
  }
  return dono
}

/**
 * Esta publicação entra na taxa de extração? A taxa responde "do que o robô
 * tentou, quanto saiu". Fica de fora o que ainda não foi tentado ('pendente') e
 * a duplicata. Até 17/10/2026 o pendente contava como falha: um dia sem rodada
 * aparecia com 0% e puxava a média do período (15 e 16/10 davam 55%, sendo 100%
 * do que foi tentado). O 'tratado_manual' continua contando como não extraído,
 * como decidido em 08/10.
 */
export function entraNaTaxa(statusEfetivo: string | null, duplicata: boolean): boolean {
  if (duplicata) return false
  return statusEfetivo !== 'pendente' && statusEfetivo !== PJE_STATUS_SUBSTITUIDA && statusEfetivo !== null
}
