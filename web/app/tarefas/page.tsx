export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { Tables } from '@/lib/supabase/types'
import AppHeader from '@/components/app-header'
import TarefasClient from './TarefasClient'
import { requireUsuario } from '@/lib/auth/usuario-atual'

type UsuarioRow = Pick<Tables<'usuarios'>, 'id' | 'nome' | 'papel'>

type TarefaComJoins = {
  id: string
  rascunho_id: string
  processo_id: string
  responsavel_id: string
  prazo_fatal: string | null
  prazo_interno: string | null
  status_tarefa: string | null
  observacoes: string | null
  encaminhada_em: string | null
  proxima_acao: string | null
  status_atual: string | null
  processo: {
    id: string
    numero_cnj: string
    status_atual: string | null
    proxima_acao: string | null
    polo_ativo: string | null
    polo_passivo: string | null
  } | null
  responsavel: { id: string; nome: string } | null
  encaminhada_por: { nome: string } | null
}

async function fetchUsuarios(): Promise<UsuarioRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nome, papel')
    .eq('ativo', true)
    .order('nome')
  if (error) throw new Error(error.message)
  return (data ?? []) as UsuarioRow[]
}

async function fetchTarefas(usuarioAtivo: UsuarioRow): Promise<TarefaComJoins[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('tarefas')
    .select(
      'id, rascunho_id, processo_id, responsavel_id, prazo_fatal, prazo_interno, status_tarefa, observacoes, encaminhada_em, proxima_acao, status_atual, processo:processos(id, numero_cnj, status_atual, proxima_acao, polo_ativo, polo_passivo), responsavel:usuarios!tarefas_responsavel_id_fkey(id, nome), encaminhada_por:usuarios!tarefas_encaminhada_por_id_fkey(nome)'
    )
    .in('status_tarefa', ['aberta', 'concluida'])
    .order('status_tarefa', { ascending: true }) // aberta antes de concluida
    .order('prazo_interno', { ascending: true, nullsFirst: false })

  if (usuarioAtivo.papel !== 'gestor') {
    query = query.eq('responsavel_id', usuarioAtivo.id)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)

  // Cada tarefa mostra a providência do rascunho que a criou, e não a do
  // processo: um processo pode ter várias tarefas, e a reanálise do robô troca o
  // texto do processo. Tarefa de antes de 17/10/2026 sem texto próprio cai no
  // do processo.
  return ((data ?? []) as TarefaComJoins[]).map((tarefa) => ({
    ...tarefa,
    processo: tarefa.processo && {
      ...tarefa.processo,
      proxima_acao: tarefa.proxima_acao ?? tarefa.processo.proxima_acao,
      status_atual: tarefa.status_atual ?? tarefa.processo.status_atual,
    },
  }))
}

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ usuario_id?: string }>
}) {
  const usuarioLogado = await requireUsuario()
  const { usuario_id } = await searchParams
  const usuarios = await fetchUsuarios()

  const usuarioAtivo: UsuarioRow =
    usuarioLogado.papel === 'gestor'
      ? usuarios.find((u) => u.id === usuario_id) ??
        { id: usuarioLogado.id, nome: usuarioLogado.nome, papel: usuarioLogado.papel }
      : { id: usuarioLogado.id, nome: usuarioLogado.nome, papel: usuarioLogado.papel }

  const tarefas = await fetchTarefas(usuarioAtivo)
  const totalAbertas = tarefas.filter((t) => t.status_tarefa === 'aberta').length

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader active="tarefas" usuario={usuarioLogado} />

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-text">Painel de tarefas</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {totalAbertas === 0
              ? 'Nenhuma tarefa aberta.'
              : `${totalAbertas} tarefa${totalAbertas > 1 ? 's' : ''} aberta${totalAbertas > 1 ? 's' : ''}, ordenada${totalAbertas > 1 ? 's' : ''} por prazo interno`}
          </p>
        </div>

        <Suspense>
          <TarefasClient
            usuarios={usuarios}
            usuarioAtivo={usuarioAtivo}
            tarefas={tarefas}
            podeTrocarUsuario={usuarioLogado.papel === 'gestor'}
            podeEditar={usuarioLogado.papel === 'gestor'}
          />
        </Suspense>
      </main>
    </div>
  )
}
