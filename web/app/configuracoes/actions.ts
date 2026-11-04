'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestor } from '@/lib/auth/usuario-atual'
import { getBaseUrl } from '@/lib/auth/base-url'
import { sincronizarGmail } from '@/lib/gmail/sincronizar'

const PAPEIS_VALIDOS = ['gestor', 'advogado', 'estagiario'] as const

export type ConvidarUsuarioState = { error?: string; sucesso?: boolean }

export async function convidarUsuario(
  _prevState: ConvidarUsuarioState,
  formData: FormData
): Promise<ConvidarUsuarioState> {
  await requireGestor()

  const nome = String(formData.get('nome') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const papel = String(formData.get('papel') ?? '')

  if (!nome || !email) return { error: 'Nome e e-mail são obrigatórios.' }
  if (!PAPEIS_VALIDOS.includes(papel as (typeof PAPEIS_VALIDOS)[number])) {
    return { error: 'Papel inválido.' }
  }

  const admin = createAdminClient()

  const { data: existente } = await admin
    .from('usuarios')
    .select('id, auth_user_id')
    .eq('email', email)
    .maybeSingle()

  let usuarioId: string

  if (!existente) {
    const { data: novo, error: insertError } = await admin
      .from('usuarios')
      .insert({ nome, email, papel, ativo: true })
      .select('id')
      .single()

    if (insertError) return { error: `Erro ao cadastrar usuário: ${insertError.message}` }
    usuarioId = novo.id
  } else if (existente.auth_user_id) {
    return { error: 'Este e-mail já tem convite ou acesso ativo.' }
  } else {
    usuarioId = existente.id
  }

  const baseUrl = await getBaseUrl()
  const { data: convite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${baseUrl}/auth/confirm?next=/convite`,
  })

  if (inviteError) return { error: `Erro ao enviar convite: ${inviteError.message}` }

  const { error: updateError } = await admin
    .from('usuarios')
    .update({ auth_user_id: convite.user.id })
    .eq('id', usuarioId)

  if (updateError) {
    return { error: `Convite enviado, mas falhou ao vincular a conta: ${updateError.message}` }
  }

  revalidatePath('/configuracoes')
  return { sucesso: true }
}

export type AlternarAtivoResultado = { error?: string }

export async function alternarAtivoUsuario(
  usuarioId: string,
  ativo: boolean
): Promise<AlternarAtivoResultado> {
  await requireGestor()

  const admin = createAdminClient()

  if (!ativo) {
    const { data: alvo } = await admin
      .from('usuarios')
      .select('papel')
      .eq('id', usuarioId)
      .maybeSingle()

    if (alvo?.papel === 'gestor') {
      const { count } = await admin
        .from('usuarios')
        .select('*', { count: 'exact', head: true })
        .eq('papel', 'gestor')
        .eq('ativo', true)
        .neq('id', usuarioId)

      if (!count) {
        return { error: 'Não é possível desativar o último gestor ativo do sistema.' }
      }
    }
  }

  const { error } = await admin.from('usuarios').update({ ativo }).eq('id', usuarioId)

  if (error) return { error: `Erro ao atualizar o usuário: ${error.message}` }

  revalidatePath('/configuracoes')
  return {}
}

export type SincronizarGmailState = { mensagem?: string; erro?: string }

const TEXTO_STATUS_SINCRONIZACAO: Record<string, string> = {
  nao_conectado: 'Nenhuma conta do Gmail conectada.',
  desconectado: 'O Gmail está desconectado. Clique em Reconectar.',
  erro: 'A sincronização falhou.',
}

export async function sincronizarGmailAgora(): Promise<SincronizarGmailState> {
  await requireGestor()
  let resumo: Awaited<ReturnType<typeof sincronizarGmail>>
  try {
    resumo = await sincronizarGmail()
  } catch (erro) {
    console.error('Falha ao sincronizar o Gmail:', erro instanceof Error ? erro.message : String(erro))
    return { erro: 'Não foi possível sincronizar agora. Tente de novo em alguns minutos.' }
  }
  revalidatePath('/configuracoes')
  revalidatePath('/dashboard')
  if (resumo.status !== 'ok') {
    return { erro: [TEXTO_STATUS_SINCRONIZACAO[resumo.status], ...resumo.erros].filter(Boolean).join(' ') }
  }
  const novos = `${resumo.novos} e-mail(s) novo(s) lido(s)`
  return resumo.erros.length > 0 ? { erro: `${novos}, com erro: ${resumo.erros.join(' | ')}` } : { mensagem: `${novos}.` }
}
