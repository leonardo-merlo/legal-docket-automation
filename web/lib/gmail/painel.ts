// Dados dos indicadores. Nunca seleciona refresh_token_cifrado.
import { createAdminClient } from '@/lib/supabase/admin'
import type { EmailParaAlerta } from '@/lib/gmail/alertas'
import { lerConfig, type ModoIngestao } from '@/lib/gmail/config'
import { acertoDaLeitura, type AcertoDaLeitura } from '@/lib/gmail/conferencia'

export interface IntegracaoVisivel {
  email_conectado: string
  status: string
  ultima_sincronizacao_em: string | null
  ultima_sincronizacao_ok_em: string | null
  ultimo_erro: string | null
}

export interface EmailRecente extends EmailParaAlerta {
  assunto: string | null
  remetente: string
  data_recebimento: string
  modo: string | null
}

export interface DadosPainelGmail {
  integracao: IntegracaoVisivel | null
  recentes: EmailRecente[]
  modo: ModoIngestao
  acerto: AcertoDaLeitura
  pautasPorConferir: number
  // calculado aqui, e não no render, para o componente continuar puro
  agora: string
}

export async function carregarPainelGmail(): Promise<DadosPainelGmail> {
  const supabase = createAdminClient()
  const [integracaoRes, emailsRes, conferidosRes, porConferirRes] = await Promise.all([
    supabase
      .from('integracao_gmail')
      .select('email_conectado, status, ultima_sincronizacao_em, ultima_sincronizacao_ok_em, ultimo_erro')
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('emails_recebidos')
      .select('id, assunto, remetente, data_recebimento, lote_id, total_cnj, total_blocos, total_fint, total_declarado, total_declarado_assunto, parser_status, aplicacao_status, erro, modo')
      .not('gmail_message_id', 'is', null)
      .order('data_recebimento', { ascending: false })
      .limit(10),
    supabase
      .from('emails_recebidos')
      .select('total_cnj, conferencia_status, conferencia_processos_errados')
      .not('conferencia_status', 'is', null),
    supabase
      .from('emails_recebidos')
      .select('id', { count: 'exact', head: true })
      .not('gmail_message_id', 'is', null)
      .is('conferencia_status', null),
  ])
  if (integracaoRes.error) throw new Error(integracaoRes.error.message)
  if (emailsRes.error) throw new Error(emailsRes.error.message)
  if (conferidosRes.error) throw new Error(conferidosRes.error.message)
  return {
    integracao: integracaoRes.data,
    recentes: emailsRes.data ?? [],
    modo: lerConfig(process.env).modo,
    acerto: acertoDaLeitura(conferidosRes.data ?? []),
    pautasPorConferir: porConferirRes.count ?? 0,
    agora: new Date().toISOString(),
  }
}
