import { NextResponse, type NextRequest } from 'next/server'
import { sincronizarGmail } from '@/lib/gmail/sincronizar'
import { bearerValido } from '@/lib/gmail/seguranca'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!bearerValido(request.headers.get('authorization'), process.env.GMAIL_SYNC_SECRET)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })
  }

  // O pg_cron manda {}. aplicar_email_ids só vale em modo ativo: é como a sessão de
  // ativação aplica, com o ok do Leonardo, pautas lidas em sombra.
  let aplicarEmailIds: string[] = []
  try {
    const corpo = (await request.json()) as { aplicar_email_ids?: unknown }
    if (Array.isArray(corpo.aplicar_email_ids)) {
      aplicarEmailIds = corpo.aplicar_email_ids.filter((id): id is string => typeof id === 'string')
    }
  } catch {
    // corpo vazio ou inválido: rodada normal
  }

  try {
    const resumo = await sincronizarGmail({ aplicarEmailIds })
    return NextResponse.json(resumo, { status: resumo.status === 'erro' ? 500 : 200 })
  } catch (erro) {
    return NextResponse.json({ error: erro instanceof Error ? erro.message : 'erro desconhecido' }, { status: 500 })
  }
}
