'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestor } from '@/lib/auth/usuario-atual'

export type AcaoResultado = { error?: string }

export async function conferirEmail(
  emailId: string,
  conferencia: { status: 'ok' | 'com_erro'; processosErrados: number | null; comentario: string }
): Promise<AcaoResultado> {
  const usuario = await requireGestor()
  const supabase = createAdminClient()

  const { data: email } = await supabase.from('emails_recebidos').select('total_cnj').eq('id', emailId).maybeSingle()
  if (!email) return { error: 'E-mail não encontrado.' }

  const comentario = conferencia.comentario.trim()
  let errados: number | null = null
  if (conferencia.status === 'com_erro') {
    errados = conferencia.processosErrados
    if (errados === null || !Number.isInteger(errados) || errados < 0) {
      return { error: 'Diga quantos processos vieram errados.' }
    }
    if (errados > (email.total_cnj ?? 0)) {
      return { error: `O e-mail tem ${email.total_cnj ?? 0} processos; não podem ter vindo ${errados} errados.` }
    }
    if (!comentario) return { error: 'Conte o que veio errado.' }
  }

  const { error } = await supabase
    .from('emails_recebidos')
    .update({
      conferencia_status: conferencia.status,
      conferencia_processos_errados: errados,
      conferencia_comentario: comentario || null,
      conferido_por_id: usuario.id,
      conferido_em: new Date().toISOString(),
    })
    .eq('id', emailId)
  if (error) return { error: `Erro ao salvar a conferência: ${error.message}` }

  revalidatePath(`/emails/${emailId}`)
  revalidatePath('/dashboard')
  return {}
}
