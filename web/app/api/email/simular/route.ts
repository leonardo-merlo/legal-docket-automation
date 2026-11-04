import { NextRequest, NextResponse } from 'next/server'
import { processarEmailTexto } from '@/lib/email/processar'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'

const EMAIL_EXEMPLO = `PROCESSO: 5435877-49.2025.8.13.0384 — PROCEDIMENTO COMUM CÍVEL
PROCESSO Nº: 5435877-49.2025.8.13.0384
ADVOGADO: Rafael Exemplo - OAB: 000.101/MG

PROCESSO: 5287934-28.2025.8.13.0384 — PROCEDIMENTO COMUM CÍVEL
PROCESSO Nº: 5287934-28.2025.8.13.0384
ADVOGADO: Helena Exemplo - OAB: 000102/MG`

export async function POST(request: NextRequest) {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  let textoEmail = EMAIL_EXEMPLO

  try {
    const body = (await request.json()) as { texto_email?: string }
    if (body.texto_email && typeof body.texto_email === 'string' && body.texto_email.trim()) {
      textoEmail = body.texto_email
    }
  } catch {
    // Body ausente ou inválido — usa o e-mail de exemplo embutido
  }

  try {
    const resultado = await processarEmailTexto(textoEmail)
    return NextResponse.json({ email_usado: textoEmail, ...resultado })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
