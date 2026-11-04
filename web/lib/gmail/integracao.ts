// Só server-side (usa o service role). Nunca devolve o token para quem chama.
import { createAdminClient } from '@/lib/supabase/admin'
import { cifrar } from '@/lib/gmail/cripto'

export function chaveDoToken(): string {
  const chave = process.env.GMAIL_TOKEN_ENCRYPTION_KEY
  if (!chave) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY não configurada.')
  return chave
}

export async function salvarConexao(dados: { email: string; refreshToken: string; usuarioId: string }): Promise<void> {
  const supabase = createAdminClient()
  const agora = new Date().toISOString()
  const { error } = await supabase.from('integracao_gmail').upsert({
    id: 1,
    email_conectado: dados.email,
    refresh_token_cifrado: cifrar(dados.refreshToken, chaveDoToken()),
    status: 'conectado',
    ultimo_erro: null,
    ultimo_erro_em: null,
    // a reconexão volta a olhar a janela da primeira sincronização
    ultima_sincronizacao_ok_em: null,
    conectado_por: dados.usuarioId,
    conectado_em: agora,
    atualizado_em: agora,
  })
  if (error) throw new Error(`Erro ao salvar a conexão do Gmail: ${error.message}`)
}
