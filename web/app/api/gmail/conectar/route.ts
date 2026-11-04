import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/auth/base-url'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'
import { urlDeAutorizacao } from '@/lib/gmail/google'
import { COOKIE_STATE_GMAIL, COOKIE_STATE_PATH } from '@/lib/gmail/seguranca'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const state = randomBytes(32).toString('hex')
  const resposta = NextResponse.redirect(urlDeAutorizacao(`${await getBaseUrl()}/api/gmail/callback`, state))
  // lax: o retorno do Google é navegação de topo (GET), então o cookie volta junto
  resposta.cookies.set(COOKIE_STATE_GMAIL, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_STATE_PATH,
    maxAge: 600,
  })
  return resposta
}
