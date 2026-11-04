import type { GmailParte } from '@/lib/gmail/mime'

const URL_AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth'
const URL_TOKEN = 'https://oauth2.googleapis.com/token'
const URL_GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export const ESCOPO_GMAIL = 'https://www.googleapis.com/auth/gmail.readonly'

export class AcessoRevogadoError extends Error {
  constructor() {
    super('O Google recusou o acesso (invalid_grant): senha trocada ou acesso revogado. Reconecte o Gmail.')
    this.name = 'AcessoRevogadoError'
  }
}

export class PermissaoNegadaError extends Error {
  constructor() {
    super('A permissão de leitura do Gmail não foi marcada na tela do Google.')
    this.name = 'PermissaoNegadaError'
  }
}

interface RespostaToken {
  access_token?: string
  refresh_token?: string
  scope?: string
  error?: string
}

export interface MensagemGmail {
  id: string
  internalDate: string
  payload: GmailParte
}

function credenciais(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET precisam estar configuradas.')
  return { clientId, clientSecret }
}

export function urlDeAutorizacao(redirectUri: string, state: string): string {
  const parametros = new URLSearchParams({
    client_id: credenciais().clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: ESCOPO_GMAIL,
    // offline + consent: é o que faz o Google devolver refresh token toda vez
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${URL_AUTORIZACAO}?${parametros.toString()}`
}

async function pedirToken(campos: Record<string, string>): Promise<RespostaToken> {
  const { clientId, clientSecret } = credenciais()
  const resposta = await fetch(URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...campos, client_id: clientId, client_secret: clientSecret }),
    cache: 'no-store',
  })
  // HTML ou 5xx do Google não pode virar SyntaxError: cai no erro com o status
  const corpo = (await resposta.json().catch(() => ({}))) as RespostaToken
  if (resposta.ok) return corpo
  if (corpo.error === 'invalid_grant') throw new AcessoRevogadoError()
  throw new Error(`O Google recusou o pedido de token (${corpo.error ?? resposta.status}).`)
}

export async function trocarCodigo(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string }> {
  const corpo = await pedirToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  // a tela do Google deixa desmarcar o escopo; sem ele o token não lê e-mail nenhum
  if (!corpo.scope?.split(' ').includes(ESCOPO_GMAIL)) throw new PermissaoNegadaError()
  if (!corpo.access_token || !corpo.refresh_token) throw new Error('O Google não devolveu o refresh token. Conecte de novo.')
  return { accessToken: corpo.access_token, refreshToken: corpo.refresh_token }
}

export async function renovarAccessToken(refreshToken: string): Promise<string> {
  const corpo = await pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken })
  if (!corpo.access_token) throw new Error('O Google não devolveu access token.')
  return corpo.access_token
}

async function gmail<T>(accessToken: string, caminho: string): Promise<T> {
  const resposta = await fetch(`${URL_GMAIL}${caminho}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!resposta.ok) throw new Error(`A API do Gmail respondeu ${resposta.status} em ${caminho.split('?')[0]}.`)
  return (await resposta.json()) as T
}

export async function lerEmailDoPerfil(accessToken: string): Promise<string> {
  const perfil = await gmail<{ emailAddress: string }>(accessToken, '/profile')
  return perfil.emailAddress
}

export async function listarIdsDeMensagens(accessToken: string, consulta: string, maxPaginas = 5): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const parametros = new URLSearchParams({ q: consulta, maxResults: '100' })
    if (pageToken) parametros.set('pageToken', pageToken)
    const resposta = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
      accessToken,
      `/messages?${parametros.toString()}`,
    )
    ids.push(...(resposta.messages ?? []).map((mensagem) => mensagem.id))
    pageToken = resposta.nextPageToken
    if (!pageToken) break
  }
  return ids
}

export async function lerMensagem(accessToken: string, id: string): Promise<MensagemGmail> {
  return gmail<MensagemGmail>(accessToken, `/messages/${encodeURIComponent(id)}?format=full`)
}
