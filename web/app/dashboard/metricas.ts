// Contas do dashboard, em funções puras.
//
// Ficam aqui, e não dentro dos componentes, porque os mesmos números aparecem em
// dois lugares da mesma tela: os cartões do topo e a tabela por dia. Definições
// duplicadas fariam o topo discordar de baixo, e ninguém descobriria olhando.

import { Tables } from '@/lib/supabase/types'
import { entraNaTaxa } from '@/lib/publicacoes'

/**
 * Uma publicação: o processo numa pauta. É a unidade das métricas — o mesmo
 * processo em duas pautas conta nas duas, cada uma com o desfecho que teve.
 */
export interface EntradaPublicacao {
  /** id da publicação */
  id: string
  processo_id: string
  /** Data da pauta, YYYY-MM-DD. */
  pauta: string
  /** Ver resolverPublicacoes: a substituída responde pelo estado da seguinte. */
  statusEfetivo: string | null
  duracao_extracao_s: number | null
  duplicata: boolean
}

/**
 * Data usada para agrupar e filtrar: a da pauta (lote_id), com a entrada no
 * sistema como reserva. O lote_id aparece nos dois formatos por razões
 * históricas — YYYY-MM-DD nas pautas novas, DD/MM/YYYY nas antigas.
 */
export function resolverDataAgrupamento(
  entrada: Pick<Tables<'processos'>, 'lote_id' | 'data_entrada'>
): string | null {
  if (entrada.lote_id) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(entrada.lote_id)) return entrada.lote_id
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(entrada.lote_id)) {
      const [dia, mes, ano] = entrada.lote_id.split('/')
      return `${ano}-${mes}-${dia}`
    }
  }
  if (entrada.data_entrada) return entrada.data_entrada.split('T')[0]
  return null
}

/** O robô tentou e não conseguiu. Não inclui 'ignorado', que nem chegou a ser tentado. */
export function ehErro(pjeStatus: string | null): boolean {
  return !!pjeStatus && (pjeStatus.startsWith('erro_') || pjeStatus === 'captcha_bloqueado')
}

export interface Metricas {
  extraidos: number
  erros: number
  pendentes: number
  /** CNJ que ninguém sabe rotear (ex.: TRF1), ou duplicata. */
  ignorados: number
  aguardandoAprovacao: number
  /** Denominador da taxa: o que o robô já tentou. Ver entraNaTaxa. */
  totalTentado: number
  /** 0 a 1. `null` quando nada foi tentado ainda — denominador zero não vira NaN. */
  taxaExtracao: number | null
  custoMedioUsd: number | null
  /** Sobre quantos processos a média de custo foi feita. Sem isto ela não é interpretável. */
  processosComCusto: number
  tempoMedioS: number | null
  processosComTempo: number
}

/**
 * `aguardandoPorPublicacao` e `custoPorPublicacao` são por publicação, não por
 * processo: o rascunho pertence à publicação que ele analisou (atribuirRascunhos).
 * Por processo, o rascunho antigo de um processo que saiu de novo na pauta era
 * contado no dia novo, que ainda nem tinha sido analisado.
 */
export function calcularMetricas(
  entradas: EntradaPublicacao[],
  aguardandoPorPublicacao: Map<string, number>,
  custoPorPublicacao: Map<string, number>
): Metricas {
  let extraidos = 0
  let erros = 0
  let pendentes = 0
  let ignorados = 0
  let aguardandoAprovacao = 0
  let totalTentado = 0
  let custoTotal = 0
  let processosComCusto = 0
  let tempoTotal = 0
  let processosComTempo = 0

  for (const entrada of entradas) {
    if (entraNaTaxa(entrada.statusEfetivo, entrada.duplicata)) totalTentado++

    if (entrada.statusEfetivo === 'processado') {
      extraidos++
      aguardandoAprovacao += aguardandoPorPublicacao.get(entrada.id) ?? 0

      // custo e tempo só dos que deram certo: processo que falhou gastou tempo
      // mas não gastou IA, e misturar os dois produz média que não descreve nada
      const custo = custoPorPublicacao.get(entrada.id)
      if (custo !== undefined) {
        custoTotal += custo
        processosComCusto++
      }
      if (entrada.duracao_extracao_s !== null) {
        tempoTotal += entrada.duracao_extracao_s
        processosComTempo++
      }
    } else if (ehErro(entrada.statusEfetivo)) {
      erros++
    } else if (entrada.statusEfetivo === 'pendente') {
      pendentes++
    } else if (entrada.statusEfetivo === 'ignorado') {
      ignorados++
    }
  }

  return {
    extraidos,
    erros,
    pendentes,
    ignorados,
    aguardandoAprovacao,
    totalTentado,
    taxaExtracao: totalTentado === 0 ? null : extraidos / totalTentado,
    custoMedioUsd: processosComCusto === 0 ? null : custoTotal / processosComCusto,
    processosComCusto,
    tempoMedioS: processosComTempo === 0 ? null : tempoTotal / processosComTempo,
    processosComTempo,
  }
}

/** "1m 43s" — segundos crus não dizem nada a quem lê de relance. */
export function formatarDuracao(segundos: number): string {
  const inteiros = Math.round(segundos)
  if (inteiros < 60) return `${inteiros}s`
  const minutos = Math.floor(inteiros / 60)
  const resto = inteiros % 60
  return resto === 0 ? `${minutos}m` : `${minutos}m ${resto}s`
}
