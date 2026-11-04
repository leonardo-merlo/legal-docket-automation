'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { addBusinessDaysFrom } from '@/lib/prazo'
import { requireGestor } from '@/lib/auth/usuario-atual'
import { Alteracao, motivosDosCampos } from '@/lib/revisao'
import { PJE_STATUS_TRATADO_MANUAL } from '@/lib/status'
import { momentoDoRascunho } from '@/lib/avisos-aprovacao'

export type AcaoResultado = { error?: string }

/**
 * Grava o que o Rafael fez com o rascunho da IA.
 *
 * Nunca derruba a ação principal: se o histórico falhar, a aprovação já
 * aconteceu e desfazer seria pior. Perder uma linha de estatística é barato;
 * deixar um prazo sem tarefa, não.
 */
async function registrarRevisao(
  supabase: ReturnType<typeof createAdminClient>,
  entrada: {
    rascunhoId: string
    processoId: string
    usuarioId: string
    acao: 'aprovado' | 'editado' | 'rejeitado'
    alteracoes?: Alteracao[]
    motivos?: string[]
    comentario?: string | null
  }
): Promise<void> {
  const { error } = await supabase.from('revisoes_rascunho').insert({
    rascunho_id: entrada.rascunhoId,
    processo_id: entrada.processoId,
    usuario_id: entrada.usuarioId,
    acao: entrada.acao,
    alteracoes: entrada.alteracoes ?? [],
    motivos: entrada.motivos ?? [],
    comentario: entrada.comentario ?? null,
  })
  if (!error) return
  console.error('[revisoes_rascunho] não registrou:', error.message)

  // Até out/2026 o banco recusava o motivo 'alerta', e com ele ia embora a linha
  // inteira — todos os campos editados naquele salvamento sumiam do histórico.
  // O que ensina é o antes/depois; sem os motivos, ainda dá para agrupar pelos campos.
  if ((entrada.motivos ?? []).length > 0) {
    const { error: semMotivos } = await supabase.from('revisoes_rascunho').insert({
      rascunho_id: entrada.rascunhoId,
      processo_id: entrada.processoId,
      usuario_id: entrada.usuarioId,
      acao: entrada.acao,
      alteracoes: entrada.alteracoes ?? [],
      motivos: [],
      comentario: entrada.comentario ?? null,
    })
    if (semMotivos) console.error('[revisoes_rascunho] não registrou nem sem motivos:', semMotivos.message)
  }
}

/**
 * Assume o processo na mão: tira da fila do robô e destrava a edição.
 *
 * Existe porque processo em erro ou pendente não tinha rascunho nenhum, e sem
 * rascunho não havia o que editar — o Rafael ficava esperando uma extração
 * que, no caso do certificado digital, não vai acontecer nunca. A partir daqui
 * o prazo é escrito por ele.
 *
 * O `motivo_ignorado` NÃO é apagado: a tag do erro continua na tela ao lado do
 * selo de tratado na mão. Esconder por que a extração falhou seria trocar um
 * problema conhecido por um invisível.
 */
export async function tratarNaMao(processoId: string): Promise<AcaoResultado> {
  const usuario = await requireGestor()
  const supabase = createAdminClient()

  const { data: processo, error: processoError } = await supabase
    .from('processos')
    .select('pje_status')
    .eq('id', processoId)
    .single()

  if (processoError || !processo) {
    return { error: `Erro ao carregar o processo: ${processoError?.message ?? 'não encontrado'}` }
  }

  if (processo.pje_status === 'processado') {
    return { error: 'Este processo já foi extraído — o rascunho da IA está aí para editar.' }
  }

  // Já existe rascunho pendente? Só se uma extração anterior deu certo e o
  // processo voltou à fila depois. Ele é reaproveitado para o gestor editar:
  // abrir um vazio ao lado deixaria duas providências esperando aprovação.
  const { data: rascunhoExistente } = await supabase
    .from('rascunhos')
    .select('id, status')
    .eq('processo_id', processoId)
    .order('data_criacao', { ascending: false })
    .limit(1)
    .maybeSingle()

  let rascunhoId = rascunhoExistente?.status === 'pendente' ? rascunhoExistente.id : null

  if (!rascunhoId) {
    // modelo_ia nulo é o que distingue "escrito pelo Rafael" de "sugerido pela
    // IA" — o painel usa isso para não somar este rascunho na média de custo,
    // que é por processo analisado pelo modelo.
    const { data: novo, error: rascunhoError } = await supabase
      .from('rascunhos')
      .insert({ processo_id: processoId, status: 'pendente', modelo_ia: null })
      .select('id')
      .single()

    if (rascunhoError || !novo) {
      return { error: `Erro ao criar o rascunho: ${rascunhoError?.message ?? 'desconhecido'}` }
    }
    rascunhoId = novo.id
  }

  const { error } = await supabase
    .from('processos')
    .update({ pje_status: PJE_STATUS_TRATADO_MANUAL })
    .eq('id', processoId)

  if (error) return { error: `Erro ao tirar da fila: ${error.message}` }

  await registrarRevisao(supabase, {
    rascunhoId, processoId, usuarioId: usuario.id, acao: 'editado',
    alteracoes: [{ campo: 'pje_status', antes: processo.pje_status, depois: PJE_STATUS_TRATADO_MANUAL }],
    comentario: 'Processo assumido manualmente — fora da fila do robô.',
  })

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/dashboard')
  revalidatePath('/processos')
  return {}
}

/**
 * Devolve o processo para a fila do robô.
 *
 * A partir daqui a extração pode sobrescrever o que foi escrito na mão — é o
 * que `supabase_writer._upsert_processo` faz com status_atual, proxima_acao e
 * responsavel_id. Por isso a tela confirma antes: é o único caminho do sistema
 * em que o trabalho do Rafael pode ser apagado por uma rodada.
 *
 * Volta como 'pendente', e não como o erro anterior: erro descreve uma
 * tentativa que aconteceu, e devolver à fila não é uma tentativa.
 */
export async function devolverAFila(processoId: string): Promise<AcaoResultado> {
  const usuario = await requireGestor()
  const supabase = createAdminClient()

  const { data: processo, error: processoError } = await supabase
    .from('processos')
    .select('pje_status')
    .eq('id', processoId)
    .single()

  if (processoError || !processo) {
    return { error: `Erro ao carregar o processo: ${processoError?.message ?? 'não encontrado'}` }
  }

  if (processo.pje_status !== PJE_STATUS_TRATADO_MANUAL) {
    return { error: 'Este processo não está marcado como tratado na mão.' }
  }

  const { error } = await supabase
    .from('processos')
    .update({ pje_status: 'pendente' })
    .eq('id', processoId)

  if (error) return { error: `Erro ao devolver à fila: ${error.message}` }

  const { data: rascunho } = await supabase
    .from('rascunhos')
    .select('id')
    .eq('processo_id', processoId)
    .order('data_criacao', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (rascunho) {
    await registrarRevisao(supabase, {
      rascunhoId: rascunho.id, processoId, usuarioId: usuario.id, acao: 'editado',
      alteracoes: [{ campo: 'pje_status', antes: PJE_STATUS_TRATADO_MANUAL, depois: 'pendente' }],
      comentario: 'Devolvido à fila do robô — a próxima extração pode sobrescrever.',
    })
  }

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/dashboard')
  revalidatePath('/processos')
  return {}
}

export async function aprovarRascunho(
  rascunhoId: string,
  processoId: string
): Promise<AcaoResultado> {
  const usuario = await requireGestor()
  const supabase = createAdminClient()

  const [{ data: rascunho, error: fetchError }, { data: processoData }, { data: irmaos }] = await Promise.all([
    supabase
      .from('rascunhos')
      .select('processo_id, status, status_sugerido, responsavel_sugerido, responsavel_sugerido_id, prazo_fatal_dias_uteis, prazo_interno_dias_uteis, proxima_acao, data_extracao, data_criacao, publicacao:publicacoes(pauta)')
      .eq('id', rascunhoId)
      .single(),
    supabase
      .from('processos')
      .select('lote_id, data_entrada')
      .eq('id', processoId)
      .single(),
    supabase
      .from('rascunhos')
      .select('id, status, data_extracao, data_criacao')
      .eq('processo_id', processoId),
  ])

  if (fetchError || !rascunho) {
    return { error: `Erro ao carregar o rascunho: ${fetchError?.message ?? 'não encontrado'}` }
  }
  // dois cliques, ou duas abas abertas, criariam duas tarefas para o mesmo rascunho
  if (rascunho.status !== 'pendente') {
    return { error: 'Este rascunho já foi revisado. Recarregue a página.' }
  }

  // O topo do processo mostra a análise aprovada mais nova. Aprovar uma análise
  // antiga cria a tarefa dela, mas não volta o topo para trás.
  const momento = momentoDoRascunho(rascunho)
  const existeAprovadoMaisNovo = (irmaos ?? []).some(
    (r) => r.id !== rascunhoId && r.status === 'aprovado' && momentoDoRascunho(r) > momento
  )

  // AGUARDAR não há ato a cumprir pelo escritório: não cria tarefa, apenas registra
  // a próxima ação no processo e fecha o rascunho (sai da fila).
  const isAguardar = rascunho.status_sugerido === 'AGUARDAR'

  // O processo passa a mostrar o que o gestor aprovou. Antes só a próxima ação
  // era copiada, e status e responsável ficavam com o palpite da IA gravado pelo
  // robô — em 08/10/2026, 119 de 174 processos aprovados mostravam outro status.
  if (!existeAprovadoMaisNovo) {
    const { error: processoError } = await supabase
      .from('processos')
      .update({
        ...(rascunho.status_sugerido ? { status_atual: rascunho.status_sugerido } : {}),
        ...(rascunho.responsavel_sugerido_id ? { responsavel_id: rascunho.responsavel_sugerido_id } : {}),
        ...(rascunho.proxima_acao ? { proxima_acao: rascunho.proxima_acao } : {}),
      })
      .eq('id', processoId)

    if (processoError) return { error: `Erro ao atualizar o processo: ${processoError.message}` }
  }

  if (!isAguardar) {
    if (!rascunho.responsavel_sugerido_id) {
      return { error: 'Rascunho sem responsável definido. Edite o rascunho e selecione um responsável antes de aprovar.' }
    }

    // o prazo conta da pauta que este rascunho analisou, não da mais recente
    const dataPublicacao = rascunho.publicacao?.pauta ?? processoData?.lote_id ?? processoData?.data_entrada ?? null

    const prazoFatalDate = rascunho.prazo_fatal_dias_uteis && dataPublicacao
      ? addBusinessDaysFrom(dataPublicacao, rascunho.prazo_fatal_dias_uteis)
      : undefined
    const prazoInternoDate = rascunho.prazo_interno_dias_uteis && dataPublicacao
      ? addBusinessDaysFrom(dataPublicacao, rascunho.prazo_interno_dias_uteis)
      : null

    const { error: tarefaError } = await supabase.from('tarefas').insert({
      processo_id: rascunho.processo_id,
      rascunho_id: rascunhoId,
      responsavel_id: rascunho.responsavel_sugerido_id,
      prazo_fatal: prazoFatalDate,
      prazo_interno: prazoInternoDate,
      status_tarefa: 'aberta',
      // a tarefa guarda a providência deste rascunho: outra tarefa do mesmo
      // processo, ou a reanálise do robô, não mexem nela
      proxima_acao: rascunho.proxima_acao,
      status_atual: rascunho.status_sugerido,
    })

    if (tarefaError) return { error: `Erro ao criar a tarefa: ${tarefaError.message}` }
  }

  const { error } = await supabase
    .from('rascunhos')
    .update({ status: 'aprovado', data_revisao: new Date().toISOString() })
    .eq('id', rascunhoId)

  if (error) return { error: `Erro ao aprovar o rascunho: ${error.message}` }

  // Aprovar não pede justificativa nenhuma: se ele aprovou, estava certo. Pedir
  // formulário na ação mais frequente do dia só ensinaria a clicar sem ler.
  await registrarRevisao(supabase, {
    rascunhoId, processoId, usuarioId: usuario.id, acao: 'aprovado',
  })

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/dashboard')
  return {}
}

export async function rejeitarRascunho(
  rascunhoId: string,
  processoId: string,
  feedback: { motivos: string[]; comentario: string | null }
): Promise<AcaoResultado> {
  const usuario = await requireGestor()

  if (feedback.motivos.length === 0) {
    return { error: 'Marque ao menos um ponto que não funcionou.' }
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('rascunhos')
    .update({ status: 'rejeitado', data_revisao: new Date().toISOString() })
    .eq('id', rascunhoId)

  if (error) return { error: `Erro ao rejeitar o rascunho: ${error.message}` }

  await registrarRevisao(supabase, {
    rascunhoId, processoId, usuarioId: usuario.id, acao: 'rejeitado',
    motivos: feedback.motivos,
    comentario: feedback.comentario?.trim() || null,
  })

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/dashboard')
  revalidatePath('/processos')
  return {}
}

export async function editarRascunho(
  rascunhoId: string,
  processoId: string,
  campos: {
    status_sugerido: string | null
    responsavel_sugerido_id: string | null
    prazo_fatal_dias_uteis: number | null
    prazo_interno_dias_uteis: number | null
    proxima_acao: string | null
    // Editáveis desde 16/08. A IA pode ler errado um CPF ou um nome, e sem poder
    // corrigir só restava aprovar com o erro dentro — que o responsável leria
    // como verdade — ou rejeitar tudo e perder o resto, que estava certo.
    // A edição fica registrada como qualquer outra: ver camposEditados abaixo.
    justificativa: string | null
    alerta: string | null
  }
): Promise<AcaoResultado> {
  const usuario = await requireGestor()
  const supabase = createAdminClient()

  const { data: atual, error: fetchError } = await supabase
    .from('rascunhos')
    .select('status_sugerido, responsavel_sugerido_id, prazo_fatal_dias_uteis, prazo_interno_dias_uteis, proxima_acao, justificativa, alerta, campos_editados_manualmente')
    .eq('id', rascunhoId)
    .single()

  if (fetchError) return { error: `Erro ao buscar o rascunho: ${fetchError.message}` }

  const camposAlterados = (Object.keys(campos) as Array<keyof typeof campos>).filter(
    (campo) => campos[campo] !== atual[campo]
  )
  const camposEditados = new Set(atual.campos_editados_manualmente ?? [])
  camposAlterados.forEach((campo) => camposEditados.add(campo))

  const { data, error } = await supabase
    .from('rascunhos')
    .update({
      ...campos,
      campos_editados_manualmente: Array.from(camposEditados),
      ...(camposAlterados.length > 0 ? { editado_manualmente_em: new Date().toISOString() } : {}),
    })
    .eq('id', rascunhoId)
    .select('id')
    .single()

  if (error) return { error: `Erro ao salvar o rascunho: ${error.message}` }
  if (!data) return { error: 'Rascunho não encontrado.' }

  // O valor ANTES é o que ensina: saber que o prazo mudou não corrige o prompt,
  // saber que a IA disse 15 e o certo era 10, sim.
  if (camposAlterados.length > 0) {
    await registrarRevisao(supabase, {
      rascunhoId, processoId, usuarioId: usuario.id, acao: 'editado',
      alteracoes: camposAlterados.map((campo) => ({
        campo, antes: atual[campo], depois: campos[campo],
      })),
      motivos: motivosDosCampos(camposAlterados),
    })
  }

  revalidatePath(`/processos/${processoId}`)
  revalidatePath('/dashboard')
  return {}
}
