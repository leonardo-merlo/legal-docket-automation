'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type DefinirSenhaState = { error?: string }

export async function definirSenha(
  _prevState: DefinirSenhaState,
  formData: FormData
): Promise<DefinirSenhaState> {
  const senha = String(formData.get('senha') ?? '')
  const confirmacao = String(formData.get('confirmacao') ?? '')

  if (senha.length < 8) return { error: 'A senha precisa ter pelo menos 8 caracteres.' }
  if (senha !== confirmacao) return { error: 'As senhas não coincidem.' }

  const supabase = await createClient()
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser()

  if (getUserError || !user) return { error: 'Link inválido ou expirado. Solicite um novo.' }

  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) return { error: `Erro ao salvar senha: ${error.message}` }

  const admin = createAdminClient()
  const { data: usuario } = await admin
    .from('usuarios')
    .select('papel')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  redirect(usuario?.papel === 'gestor' ? '/dashboard' : '/tarefas')
}
