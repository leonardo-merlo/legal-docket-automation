import { createHash, timingSafeEqual } from 'node:crypto'

export const COOKIE_STATE_GMAIL = 'gmail_oauth_state'
export const COOKIE_STATE_PATH = '/api/gmail'

// Compara os hashes, e não os textos: timingSafeEqual exige o mesmo tamanho, e
// recusar pelo tamanho antes vazaria o tamanho do segredo.
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

export function bearerValido(cabecalho: string | null, segredo: string | undefined): boolean {
  if (!segredo || !cabecalho?.startsWith('Bearer ')) return false
  return iguaisEmTempoConstante(cabecalho.slice('Bearer '.length), segredo)
}
