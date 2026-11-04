import { ehDataDeLote } from './gravacao.ts'

export type ModoIngestao = 'sombra' | 'ativo'

export const REMETENTES_PADRAO = ['intimacoes@exemplo-adv.example', 'oabmg@recortedigital.adv.br']

// A caixa que recebe a pauta. Conectar outra conta deixaria a ingestão lendo a
// caixa errada, e o único sinal seria "último e-mail há X dias".
export function contaEsperada(env: Record<string, string | undefined>): string {
  return (env.GMAIL_CONTA_ESPERADA ?? 'gestor@exemplo-adv.example').trim().toLowerCase()
}

export interface ConfigIngestao {
  remetentes: string[]
  modo: ModoIngestao
  loteCorte: string | null
  janelaDias: number
  janelaPrimeiraSincronizacaoDias: number
}

export function lerConfig(env: Record<string, string | undefined>): ConfigIngestao {
  const remetentes = (env.GMAIL_REMETENTES ?? '')
    .split(',')
    .map((remetente) => remetente.trim().toLowerCase())
    .filter(Boolean)
  const loteCorte = (env.GMAIL_LOTE_CORTE ?? '').trim()
  // Ativo só com corte válido: sem ele, a ingestão regravaria as pautas que o Cowork já fez.
  const ativo = env.GMAIL_INGESTAO_MODO?.trim() === 'ativo' && ehDataDeLote(loteCorte)
  return {
    remetentes: remetentes.length > 0 ? remetentes : REMETENTES_PADRAO,
    modo: ativo ? 'ativo' : 'sombra',
    loteCorte: ativo ? loteCorte : null,
    janelaDias: 7,
    // a 1ª rodada recupera as pautas que o Cowork deixou para trás (decidido em 10/09/2026);
    // 60 dias desde 08/10/2026, para alcançar as pautas de 20–21/08 e 01–04/09
    janelaPrimeiraSincronizacaoDias: 60,
  }
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

// Sem rodada completa anterior, olha a janela larga. Com ela, cobre o tempo desde então
// (mais um dia de folga), para uma pausa do cron não deixar pauta para trás.
export function diasDaJanela(
  okEm: string | null,
  agora: Date,
  config: Pick<ConfigIngestao, 'janelaDias' | 'janelaPrimeiraSincronizacaoDias'>,
): number {
  if (!okEm) return config.janelaPrimeiraSincronizacaoDias
  const decorridos = Math.ceil((agora.getTime() - new Date(okEm).getTime()) / UM_DIA_MS) + 1
  return Math.max(config.janelaDias, decorridos)
}

export function montarConsulta(remetentes: string[], dias: number): string {
  return `from:(${remetentes.join(' OR ')}) subject:"Recorte Digital" newer_than:${dias}d`
}

export function remetenteAceito(cabecalhoFrom: string | null, remetentes: string[]): boolean {
  if (!cabecalhoFrom) return false
  const endereco = (/<([^>]+)>/.exec(cabecalhoFrom)?.[1] ?? cabecalhoFrom).trim().toLowerCase()
  return remetentes.includes(endereco)
}
