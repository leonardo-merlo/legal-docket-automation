export const dynamic = 'force-dynamic'
// vale para as server actions da página: o botão de sincronizar o Gmail pode passar dos 10 s
export const maxDuration = 60

import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestor } from '@/lib/auth/usuario-atual'
import AppHeader from '@/components/app-header'
import ConvidarUsuarioForm from './ConvidarUsuarioForm'
import UsuariosList from './UsuariosList'
import { carregarPainelGmail } from '@/lib/gmail/painel'
import ConexaoGmail from './ConexaoGmail'

type UsuarioRow = {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  auth_user_id: string | null
}

async function fetchUsuarios(): Promise<UsuarioRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, email, papel, ativo, auth_user_id')
    .order('nome')
  if (error) throw new Error(error.message)
  return (data ?? []) as UsuarioRow[]
}

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const usuarioLogado = await requireGestor()
  const [usuarios, dadosGmail, { gmail }] = await Promise.all([fetchUsuarios(), carregarPainelGmail(), searchParams])

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader active="configuracoes" usuario={usuarioLogado} />

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-text">Configurações</h1>
          <p className="mt-1 text-sm text-text-secondary">Gestão de acesso da equipe e integração com o Gmail</p>
        </div>

        <ConexaoGmail dados={dadosGmail} retorno={gmail} />

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-medium text-text mb-4">Convidar novo usuário</h2>
          <ConvidarUsuarioForm />
        </section>

        <section>
          <h2 className="text-sm font-medium text-text mb-3">Usuários cadastrados</h2>
          <UsuariosList usuarios={usuarios} />
        </section>
      </main>
    </div>
  )
}
