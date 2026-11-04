import { NextRequest, NextResponse } from 'next/server'
import { processarEmailTexto } from '@/lib/email/processar'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'

export async function POST(request: NextRequest) {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { texto_email } = body as { texto_email?: string }

  if (!texto_email || typeof texto_email !== 'string' || !texto_email.trim()) {
    return NextResponse.json({ error: 'texto_email é obrigatório' }, { status: 400 })
  }

  try {
    const resultado = await processarEmailTexto(texto_email)
    return NextResponse.json(resultado)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
