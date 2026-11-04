'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { addBusinessDaysFrom } from '@/lib/prazo'
import { requireGestor } from '@/lib/auth/usuario-atual'

export type ResultadoBuscaCnj = {
  id: string
  numero_cnj: string
  polo_ativo: string | null
  lote_id: string | null
  data_entrada: string | null
  pje_status: string | null
}

export type AcaoResultado = { error?: string }

export async function buscarProcessoPorCnj(busca: string): Promise<ResultadoBuscaCnj[]> {
  await requireGestor()
  const digits = busca.replace(/\D/g, '')
  if (digits.length < 4) return []
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('buscar_processos_cnj', { busca })
  if (error) throw new Error(error.message)
  return (data ?? []) as ResultadoBuscaCnj[]
}

export async function atualizarStatus(
  numeroCnj: string,
  novoStatus: string
): Promise<AcaoResultado> {
  await requireGestor()
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('processos')
    .update({ status_atual: novoStatus })
    .eq('numero_cnj', numeroCnj)

  if (error) return { error: `Erro ao atualizar o processo: ${error.message}` }

  revalidatePath('/dashboard')
  return {}
}

export async function atualizarStatusRascunho(
  rascunhoId: string,
  novoStatus: string
): Promise<AcaoResultado> {
  await requireGestor()
  const supabase = createAdminClient()

  if (novoStatus === 'aprovado') {
    const { data: rascunho, error: fetchError } = await supabase
      .from('rascunhos')
      .select('processo_id, responsavel_sugerido_id, prazo_fatal_dias_uteis, prazo_interno_dias_uteis, proxima_acao')
      .eq('id', rascunhoId)
      .single()

    if (fetchError) return { error: `Erro ao carregar o rascunho: ${fetchError.message}` }
    if (!rascunho.responsavel_sugerido_id) return { error: 'Rascunho sem responsável definido.' }

    const { data: processoData } = await supabase
      .from('processos')
      .select('lote_id, data_entrada')
      .eq('id', rascunho.processo_id)
      .single()

    const dataPublicacao = processoData?.lote_id ?? processoData?.data_entrada ?? null

    // copiar proxima_acao do rascunho para o processo
    if (rascunho.proxima_acao) {
      await supabase
        .from('processos')
        .update({ proxima_acao: rascunho.proxima_acao })
        .eq('id', rascunho.processo_id)
    }

    const prazoFatalDate = rascunho.prazo_fatal_dias_uteis && dataPublicacao
      ? addBusinessDaysFrom(dataPublicacao, rascunho.prazo_fatal_dias_uteis)
      : null
    const prazoInternoDate = rascunho.prazo_interno_dias_uteis && dataPublicacao
      ? addBusinessDaysFrom(dataPublicacao, rascunho.prazo_interno_dias_uteis)
      : null

    const { error: tarefaError } = await supabase.from('tarefas').insert({
      processo_id: rascunho.processo_id,
      rascunho_id: rascunhoId,
      responsavel_id: rascunho.responsavel_sugerido_id,
      prazo_fatal: prazoFatalDate ?? undefined,
      prazo_interno: prazoInternoDate,
      status_tarefa: 'aberta',
    })

    if (tarefaError) return { error: `Erro ao criar a tarefa: ${tarefaError.message}` }
  }

  const { error } = await supabase
    .from('rascunhos')
    .update({
      status: novoStatus,
      data_revisao: novoStatus === 'aprovado' ? new Date().toISOString() : null,
    })
    .eq('id', rascunhoId)

  if (error) return { error: `Erro ao atualizar o rascunho: ${error.message}` }

  revalidatePath('/dashboard')
  return {}
}
