import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type UsuarioAtual = {
  id: string
  nome: string
  email: string
  papel: string
}

export async function getUsuarioAtual(): Promise<UsuarioAtual | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const admin = createAdminClient()
  const { data: usuario } = await admin
    .from('usuarios')
    .select('id, nome, email, papel, ativo')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!usuario || !usuario.ativo) {
    // sessão sem perfil ativo correspondente — encerra a sessão
    await supabase.auth.signOut()
    return null
  }

  return { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel }
}

export async function requireUsuario(): Promise<UsuarioAtual> {
  const usuario = await getUsuarioAtual()
  if (!usuario) redirect('/login')
  return usuario
}

export async function requireGestor(): Promise<UsuarioAtual> {
  const usuario = await requireUsuario()
  if (usuario.papel !== 'gestor') redirect('/tarefas')
  return usuario
}
