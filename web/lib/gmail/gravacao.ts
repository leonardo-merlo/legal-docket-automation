import { PJE_STATUS_TRATADO_MANUAL } from '../status.ts'
import type { ProcessoDaPauta, SistemaProcesso } from './parser.ts'

// Mesmo texto e mesmos limites de aviso_publicacao_ignorada em runner.py: o painel já
// mostra observacoes em três telas, e o agente e a ingestão escrevem no mesmo formato.
const MARCA_AVISO = 'Publicação nova em '
const AVISO_MAX_LINHAS = 10

export interface LinhaExistente {
  pje_status: string | null
  observacoes: string | null
}

export interface DadosProcesso {
  numero_cnj: string
  lote_id?: string
  numero_publicacao: string
  fonte: 'gmail_api'
  email_id: string
  pje_status: 'pendente'
  duplicata: false
  vara?: string
  comarca?: string
  polo_ativo?: string
  polo_passivo?: string
  classe_processual?: string
  sistema?: SistemaProcesso
}

export type Gravacao =
  | { tipo: 'inserir'; dados: DadosProcesso }
  | { tipo: 'atualizar'; dados: DadosProcesso }
  | { tipo: 'avisar_tratado_manual'; observacoes: string }

function paraData(ddmmaaaa: string): number | null {
  const achado = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmaaaa.trim())
  if (!achado) return null
  const [dia, mes, ano] = [Number(achado[1]), Number(achado[2]), Number(achado[3])]
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  const existe = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  return existe ? data.getTime() : null
}

export function ehDataDeLote(valor: string): boolean {
  return paraData(valor) !== null
}

export function loteDepoisDoCorte(loteId: string | null, corte: string): boolean {
  const lote = loteId ? paraData(loteId) : null
  const limite = paraData(corte)
  return lote !== null && limite !== null && lote > limite
}

function dataDaPauta(loteId: string | null, hoje: Date): string {
  const bruto = (loteId ?? '').trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(bruto)) return bruto
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bruto)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export function avisoPublicacaoIgnorada(loteId: string | null, observacoes: string | null, hoje: Date = new Date()): string {
  const linha = `${MARCA_AVISO}${dataDaPauta(loteId, hoje)} — processo tratado na mão, não voltou para a fila.`
  const anteriores = (observacoes ?? '').split('\n').filter((l) => l.trim())
  if (anteriores.includes(linha)) return anteriores.join('\n')
  // o limite vale só para os avisos: a anotação de quem trata o processo nunca sai
  const avisos = anteriores.filter((l) => l.startsWith(MARCA_AVISO)).slice(0, AVISO_MAX_LINHAS - 1)
  const anotacoes = anteriores.filter((l) => !l.startsWith(MARCA_AVISO))
  return [linha, ...avisos, ...anotacoes].join('\n')
}

// Decidido com o Leonardo em 10/09/2026: publicação nova = análise nova (volta para
// 'pendente', como o Cowork), exceto quem o gestor assumiu na mão — esse só recebe o aviso.
// Nunca grava duplicata = true: o agente filtra duplicata = false e o CNJ sumiria da fila.
export function decidirGravacao(
  processo: ProcessoDaPauta,
  existente: LinhaExistente | undefined,
  contexto: { loteId: string | null; emailId: string },
  hoje: Date = new Date(),
): Gravacao {
  if (existente?.pje_status === PJE_STATUS_TRATADO_MANUAL) {
    return { tipo: 'avisar_tratado_manual', observacoes: avisoPublicacaoIgnorada(contexto.loteId, existente.observacoes, hoje) }
  }
  const dados: DadosProcesso = {
    numero_cnj: processo.numeroCnj,
    // repetido na pauta grava todos os números ("20, 21"), como a página do e-mail mostra
    numero_publicacao: processo.publicacoes.join(', '),
    fonte: 'gmail_api',
    email_id: contexto.emailId,
    pje_status: 'pendente',
    duplicata: false,
  }
  // lote nulo não entra: no UPDATE apagaria o valor que já está no banco. A nota de
  // duplicado do parser também não: os números já estão em numero_publicacao.
  if (contexto.loteId) dados.lote_id = contexto.loteId
  // campo que a publicação não trouxe não apaga o que já estava no banco
  if (processo.vara) dados.vara = processo.vara
  if (processo.comarca) dados.comarca = processo.comarca
  if (processo.poloAtivo) dados.polo_ativo = processo.poloAtivo
  if (processo.poloPassivo) dados.polo_passivo = processo.poloPassivo
  if (processo.classeProcessual) dados.classe_processual = processo.classeProcessual
  if (processo.sistema) dados.sistema = processo.sistema
  return existente ? { tipo: 'atualizar', dados } : { tipo: 'inserir', dados }
}
