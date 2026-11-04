'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type LoginState = { error?: string }

function isNextSeguro(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const senha = String(formData.get('senha') ?? '')
  const next = String(formData.get('next') ?? '')

  if (!email || !senha) return { error: 'Informe e-mail e senha.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) return { error: 'E-mail ou senha inválidos.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: usuario } = await admin
    .from('usuarios')
    .select('papel, ativo')
    .eq('auth_user_id', user?.id ?? '')
    .maybeSingle()

  if (!usuario || !usuario.ativo) {
    await supabase.auth.signOut()
    return { error: 'Conta sem acesso liberado. Fale com o gestor.' }
  }

  const destino = usuario.papel === 'gestor' ? '/dashboard' : '/tarefas'
  redirect(isNextSeguro(next) ? next : destino)
}
