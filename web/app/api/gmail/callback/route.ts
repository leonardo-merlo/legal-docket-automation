import { NextResponse, type NextRequest } from 'next/server'
import { getBaseUrl } from '@/lib/auth/base-url'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'
import { contaEsperada } from '@/lib/gmail/config'
import { lerEmailDoPerfil, PermissaoNegadaError, trocarCodigo } from '@/lib/gmail/google'
import { salvarConexao } from '@/lib/gmail/integracao'
import { COOKIE_STATE_GMAIL, COOKIE_STATE_PATH, iguaisEmTempoConstante } from '@/lib/gmail/seguranca'

export const dynamic = 'force-dynamic'

async function concluirConexao(code: string, redirectUri: string, usuarioId: string): Promise<string> {
  try {
    const { accessToken, refreshToken } = await trocarCodigo(code, redirectUri)
    const email = await lerEmailDoPerfil(accessToken)
    if (email.trim().toLowerCase() !== contaEsperada(process.env)) return 'conta_errada'
    await salvarConexao({ email, refreshToken, usuarioId })
    return 'conectado'
  } catch (erro) {
    if (erro instanceof PermissaoNegadaError) return 'sem_permissao'
    // só a mensagem: o objeto de erro pode carregar o corpo da resposta do Google
    console.error('[gmail/callback]', erro instanceof Error ? erro.message : 'erro desconhecido')
    return 'erro'
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const base = await getBaseUrl()
  const gestor = await requireGestorApi()
  const parametros = request.nextUrl.searchParams
  const code = parametros.get('code')
  const state = parametros.get('state')
  const stateEsperado = request.cookies.get(COOKIE_STATE_GMAIL)?.value

  let resultado: string
  if (!gestor) resultado = 'nao_autorizado'
  else if (parametros.get('error')) resultado = 'recusado'
  else if (!code || !state || !stateEsperado || !iguaisEmTempoConstante(state, stateEsperado)) resultado = 'state_invalido'
  else resultado = await concluirConexao(code, `${base}/api/gmail/callback`, gestor.id)

  const resposta = NextResponse.redirect(`${base}/configuracoes?gmail=${resultado}`)
  resposta.cookies.set(COOKIE_STATE_GMAIL, '', { path: COOKIE_STATE_PATH, maxAge: 0 })
  return resposta
}
