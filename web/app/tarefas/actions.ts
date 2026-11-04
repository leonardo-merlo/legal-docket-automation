'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUsuario, requireGestor } from '@/lib/auth/usuario-atual'

export type AcaoResultado = { error?: string }

export async function concluirTarefa(tarefaId: string): Promise<AcaoResultado> {
  await requireUsuario()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tarefas')
    .update({ status_tarefa: 'concluida', atualizado_em: new Date().toISOString() })
    .eq('id', tarefaId)
  if (error) return { error: `Erro ao concluir a tarefa: ${error.message}` }
  revalidatePath('/tarefas')
  return {}
}

export async function desconcluirTarefa(tarefaId: string): Promise<AcaoResultado> {
  await requireUsuario()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tarefas')
    .update({ status_tarefa: 'aberta', atualizado_em: new Date().toISOString() })
    .eq('id', tarefaId)
  if (error) return { error: `Erro ao reabrir a tarefa: ${error.message}` }
  revalidatePath('/tarefas')
  return {}
}

/**
 * Uma linha no histórico de encaminhamentos. A tabela só recebe linhas novas:
 * é o que responde "com quem a tarefa estava, e desde quando".
 */
async function registrarEncaminhamento(
  supabase: ReturnType<typeof createAdminClient>,
  dados: { tarefaId: string; processoId: string | null; de: string | null; para: string; por: string }
): Promise<string | null> {
  const { error } = await supabase.from('tarefa_encaminhamentos').insert({
    tarefa_id: dados.tarefaId,
    processo_id: dados.processoId,
    de_responsavel_id: dados.de,
    para_responsavel_id: dados.para,
    encaminhada_por_id: dados.por,
  })
  return error ? error.message : null
}

export async function editarTarefa(
  tarefaId: string,
  processoId: string | null,
  campos: {
    prazo_fatal: string | null
    prazo_interno: string | null
    responsavel_id: string
    observacoes: string | null
    proxima_acao: string | null
  }
): Promise<AcaoResultado> {
  const gestor = await requireGestor()
  const supabase = createAdminClient()

  const { proxima_acao, ...camposTarefa } = campos

  const { data: antes } = await supabase.from('tarefas').select('responsavel_id, processo_id').eq('id', tarefaId).maybeSingle()
  const trocouResponsavel = Boolean(antes) && antes?.responsavel_id !== campos.responsavel_id

  const agora = new Date().toISOString()
  const { error } = await supabase
    .from('tarefas')
    .update({
      ...camposTarefa,
      // o texto é da tarefa: com várias tarefas no mesmo processo, gravar no
      // processo mudava o texto de todas
      ...(proxima_acao ? { proxima_acao } : {}),
      // trocar o responsável pelo Editar também é encaminhar: aparece igual no cartão
      ...(trocouResponsavel ? { encaminhada_por_id: gestor.id, encaminhada_em: agora } : {}),
      atualizado_em: agora,
    })
    .eq('id', tarefaId)
  if (error) return { error: `Erro ao salvar a tarefa: ${error.message}` }

  if (trocouResponsavel && antes) {
    const erroHistorico = await registrarEncaminhamento(supabase, {
      tarefaId,
      processoId: antes.processo_id,
      de: antes.responsavel_id,
      para: campos.responsavel_id,
      por: gestor.id,
    })
    if (erroHistorico) return { error: `A tarefa foi salva, mas o histórico de encaminhamento não: ${erroHistorico}` }
  }

  if (processoId) revalidatePath(`/processos/${processoId}`)

  revalidatePath('/tarefas')
  return {}
}

/**
 * Quem pode mexer na tarefa sem ser gestor: o responsável por ela. Encaminhar e
 * anotar a observação são do dia a dia do advogado (reunião de 09/10/2026).
 * O processo vem da própria tarefa, nunca do navegador: senão quem tem uma
 * tarefa poderia mexer no processo de outra.
 */
async function tarefaAoAlcance(
  tarefaId: string
): Promise<{ usuarioId: string; gestor: boolean; responsavelId: string; processoId: string | null } | { error: string }> {
  const usuario = await requireUsuario()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tarefas')
    .select('responsavel_id, processo_id')
    .eq('id', tarefaId)
    .maybeSingle()
  if (!data) return { error: 'Tarefa não encontrada.' }
  const gestor = usuario.papel === 'gestor'
  if (!gestor && data.responsavel_id !== usuario.id) return { error: 'Esta tarefa não está com você.' }
  return { usuarioId: usuario.id, gestor, responsavelId: data.responsavel_id, processoId: data.processo_id }
}

export async function salvarObservacaoTarefa(tarefaId: string, observacoes: string): Promise<AcaoResultado> {
  const tarefa = await tarefaAoAlcance(tarefaId)
  if ('error' in tarefa) return tarefa
  const supabase = createAdminClient()
  let update = supabase
    .from('tarefas')
    .update({ observacoes: observacoes.trim() || null, atualizado_em: new Date().toISOString() })
    .eq('id', tarefaId)
  // se encaminharam a tarefa no meio do caminho, o advogado de antes não grava mais
  if (!tarefa.gestor) update = update.eq('responsavel_id', tarefa.usuarioId)
  const { data, error } = await update.select('id')
  if (error) return { error: `Erro ao salvar a observação: ${error.message}` }
  if (!data?.length) return { error: 'Esta tarefa não está mais com você.' }
  revalidatePath('/tarefas')
  if (tarefa.processoId) revalidatePath(`/processos/${tarefa.processoId}`)
  return {}
}

export async function encaminharTarefa(tarefaId: string, novoResponsavelId: string): Promise<AcaoResultado> {
  const tarefa = await tarefaAoAlcance(tarefaId)
  if ('error' in tarefa) return tarefa
  if (novoResponsavelId === tarefa.responsavelId) return { error: 'A tarefa já está com essa pessoa.' }
  const supabase = createAdminClient()

  const { data: destino } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', novoResponsavelId)
    .eq('ativo', true)
    .maybeSingle()
  if (!destino) return { error: 'Escolha alguém da equipe para encaminhar.' }

  const agora = new Date().toISOString()
  let update = supabase
    .from('tarefas')
    .update({
      responsavel_id: novoResponsavelId,
      encaminhada_por_id: tarefa.usuarioId,
      encaminhada_em: agora,
      atualizado_em: agora,
    })
    .eq('id', tarefaId)
  if (!tarefa.gestor) update = update.eq('responsavel_id', tarefa.usuarioId)
  const { data, error } = await update.select('id')
  if (error) return { error: `Erro ao encaminhar a tarefa: ${error.message}` }
  if (!data?.length) return { error: 'Esta tarefa não está mais com você.' }

  const erroHistorico = await registrarEncaminhamento(supabase, {
    tarefaId,
    processoId: tarefa.processoId,
    de: tarefa.responsavelId,
    para: novoResponsavelId,
    por: tarefa.usuarioId,
  })
  if (erroHistorico) return { error: `A tarefa foi encaminhada, mas o histórico não foi gravado: ${erroHistorico}` }

  // o processo mostra o responsável no topo: tem de acompanhar a tarefa
  if (tarefa.processoId) {
    const { error: erroProcesso } = await supabase
      .from('processos')
      .update({ responsavel_id: novoResponsavelId })
      .eq('id', tarefa.processoId)
    if (erroProcesso) return { error: `A tarefa foi encaminhada, mas o responsável do processo não mudou: ${erroProcesso.message}` }
    revalidatePath(`/processos/${tarefa.processoId}`)
  }
  revalidatePath('/tarefas')
  return {}
}
