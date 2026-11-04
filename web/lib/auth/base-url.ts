import { headers } from 'next/headers'

export async function getBaseUrl(): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) return siteUrl.replace(/\/$/, '')

  if (process.env.NODE_ENV === 'production') {
    // sem NEXT_PUBLIC_SITE_URL em produção, cairia no header Host — que pode ser forjado
    // e vazar o token de convite/reset para um dominio malicioso. Falha alto em vez de silencioso.
    throw new Error('NEXT_PUBLIC_SITE_URL não configurada em produção.')
  }

  // fallback só para desenvolvimento local, onde não há um dominio fixo configurado
  const headersList = await headers()
  const host = headersList.get('host')
  const proto = headersList.get('x-forwarded-proto') ?? 'http'
  return `${proto}://${host}`
}
