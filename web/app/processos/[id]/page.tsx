export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Tables } from '@/lib/supabase/types'
import { requireUsuario } from '@/lib/auth/usuario-atual'
import RascunhoDetalhe from './RascunhoDetalhe'
import DocumentosHistorico from './DocumentosHistorico'
import TratarNaMao from './TratarNaMao'
import ObservacaoTarefa from './ObservacaoTarefa'
import AppHeader from '@/components/app-header'
import { numerosDaPublicacao, observacoesSemDuplicado } from '@/lib/publicacao'
import { statusLabel, pjeStatusInfo, PJE_STATUS_TRATADO_MANUAL } from '@/lib/status'
import { resolverDataAgrupamento } from '@/app/dashboard/metricas'
import { atribuirRascunhos } from '@/lib/publicacoes'
import { avisosDeAprovacao, momentoDoRascunho } from '@/lib/avisos-aprovacao'

type ProcessoComEmail = Tables<'processos'> & {
  email: Pick<Tables<'emails_recebidos'>, 'id' | 'assunto' | 'data_recebimento'> | null
  responsavel: { nome: string } | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/** A setinha das seções que abrem e fecham. Gira quando o <details> abre. */
function Seta() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary transition-transform group-open:rotate-180"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  )
}

/** DD/MM/AAAA a partir do YYYY-MM-DD já normalizado. */
function formatDataPauta(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export default async function ProcessoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const usuarioLogado = await requireUsuario()
  const isGestor = usuarioLogado.papel === 'gestor'

  const supabase = createAdminClient()

  const [processoRes, rascunhosRes, documentosRes, usuariosRes, publicacoesRes, tarefasRes] = await Promise.all([
    supabase
      .from('processos')
      .select('*, email:emails_recebidos(id, assunto, data_recebimento), responsavel:usuarios(nome)')
      .eq('id', id)
      .single(),
    // todos os rascunhos: desde 17/10/2026 a análise nova não escreve por cima
    // da anterior, e cada um pode virar a sua tarefa
    supabase
      .from('rascunhos')
      .select('*')
      .eq('processo_id', id),
    supabase
      .from('documentos')
      .select('*')
      .eq('processo_id', id)
      .order('indice', { ascending: false }),
    supabase
      .from('usuarios')
      .select('id, nome')
      .eq('ativo', true),
    supabase
      .from('publicacoes')
      .select('id, processo_id, pauta, criada_em, pje_status')
      .eq('processo_id', id),
    supabase
      .from('tarefas')
      .select('id, rascunho_id, responsavel_id, observacoes, status_tarefa, prazo_fatal, prazo_interno, proxima_acao, concluida_em, responsavel:usuarios!tarefas_responsavel_id_fkey(nome)')
      .eq('processo_id', id)
      .order('criado_em', { ascending: false }),
  ])

  if (processoRes.error || !processoRes.data) notFound()

  const { data: encaminhamentos } = await supabase
    .from('tarefa_encaminhamentos')
    .select('id, tarefa_id, criado_em, de:usuarios!tarefa_encaminhamentos_de_responsavel_id_fkey(nome), para:usuarios!tarefa_encaminhamentos_para_responsavel_id_fkey(nome), por:usuarios!tarefa_encaminhamentos_encaminhada_por_id_fkey(nome)')
    .eq('processo_id', id)
    .order('criado_em', { ascending: true })

  const tarefas = tarefasRes.data ?? []

  if (!isGestor && !tarefas.some((t) => t.responsavel_id === usuarioLogado.id)) redirect('/tarefas')

  const processo = processoRes.data as ProcessoComEmail
  const documentos = documentosRes.data ?? []
  const usuarios = usuariosRes.data ?? []
  const statusInfo = pjeStatusInfo(processo.pje_status)
  const tratadoNaMao = processo.pje_status === PJE_STATUS_TRATADO_MANUAL

  // Quem chega aqui quase sempre veio da lista daquele dia e quer voltar para
  // ela, não para o dashboard — o caminho de volta precisa oferecer as duas.
  const dataPauta = resolverDataAgrupamento(processo)

  const publicacoes = publicacoesRes.data ?? []
  const pautaDaPublicacao = new Map(publicacoes.map((p) => [p.id, p.pauta]))
  // rascunho antigo sem publicação gravada cai na regra de horário
  const donoPorHorario = atribuirRascunhos(publicacoes, rascunhosRes.data ?? [])
  const rascunhos = (rascunhosRes.data ?? [])
    .map((r) => ({
      ...r,
      pauta: pautaDaPublicacao.get(r.publicacao_id ?? donoPorHorario.get(r.id) ?? '') ?? null,
    }))
    .sort((x, y) => momentoDoRascunho(y).localeCompare(momentoDoRascunho(x)))
  const maisRecente = rascunhos[0] ?? null

  // Processo que saiu de novo na pauta volta para a fila com os documentos e o
  // rascunho da análise anterior. Sem dizer de que pauta eles são, a tela falava
  // "a extração ainda não trouxe este processo" com tudo extraído logo abaixo.
  const analiseAnterior = processo.pje_status === 'pendente' && maisRecente?.pauta && dataPauta && maisRecente.pauta < dataPauta
    ? formatDataPauta(maisRecente.pauta)
    : null

  const tarefasAbertas = tarefas
    .filter((t) => t.status_tarefa === 'aberta')
    .map((t) => ({ responsavel: t.responsavel?.nome ?? 'alguém da equipe', prazoFatal: t.prazo_fatal }))

  const nomeDoUsuario = (usuarioId: string | null) =>
    usuarioId ? (usuarios.find((u) => u.id === usuarioId)?.nome ?? '—') : '—'

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader active={isGestor ? 'dashboard' : 'tarefas'} usuario={usuarioLogado} />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">

        <nav className="flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
          <Link href="/dashboard" className="transition-colors hover:text-text">Dashboard</Link>
          {dataPauta && (
            <>
              <span>/</span>
              <Link href={`/entradas/${dataPauta}`} className="transition-colors hover:text-text">
                {formatDataPauta(dataPauta)}
              </Link>
            </>
          )}
          {processo.email && (
            <>
              <span>/</span>
              <Link href={`/emails/${processo.email.id}`} className="max-w-[200px] truncate transition-colors hover:text-text">
                {processo.email.assunto ?? 'E-mail'}
              </Link>
            </>
          )}
          <span>/</span>
          <span className="truncate font-mono text-text-secondary">{processo.numero_cnj}</span>
        </nav>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold text-text">{processo.numero_cnj}</h1>
            {statusInfo && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
                {statusInfo.label}
              </span>
            )}
            {processo.status_atual && (
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
                {statusLabel(processo.status_atual)}
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {processo.polo_ativo && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-text-tertiary">Polo ativo</dt>
                <dd className="text-text-secondary">{processo.polo_ativo}</dd>
              </div>
            )}
            {processo.polo_passivo && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-text-tertiary">Polo passivo</dt>
                <dd className="text-text-secondary">{processo.polo_passivo}</dd>
              </div>
            )}
            <div>
              <dt className="text-text-tertiary">Vara</dt>
              <dd className="text-text-secondary">{processo.vara ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Comarca</dt>
              <dd className="text-text-secondary">{processo.comarca ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Responsável</dt>
              <dd className="text-text-secondary">{processo.responsavel?.nome ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Nº da publicação</dt>
              <dd className="text-text-secondary tabular-nums">{numerosDaPublicacao(processo.numero_publicacao, processo.observacoes) ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-text-tertiary">Recebido em</dt>
              <dd className="text-text-secondary">{formatDate(processo.data_criacao)}</dd>
            </div>
          </dl>

          {observacoesSemDuplicado(processo.observacoes) && (
            <div className="mt-3 rounded-md border border-warn/40 bg-warn-subtle px-3 py-2 text-sm text-warn">
              {observacoesSemDuplicado(processo.observacoes)}
            </div>
          )}
        </div>

        <section>
          <h2 className="mb-4 text-base font-semibold text-text">Rascunhos de encaminhamento</h2>

          {/* Enquanto o robô não trouxe o processo, o gestor pode assumir ele na
              mão. Fora de 'processado' porque ali o rascunho da IA já existe e é
              editável pelo caminho normal. */}
          {isGestor && processo.pje_status !== 'processado' && (
            <div className="mb-4">
              <TratarNaMao
                processoId={id}
                tratadoNaMao={tratadoNaMao}
                analiseAnterior={analiseAnterior}
                temTarefa={tarefas.some((t) => t.rascunho_id === maisRecente?.id)}
                pautaAtual={dataPauta ? formatDataPauta(dataPauta) : null}
              />
            </div>
          )}

          {rascunhos.length === 0 && (
            <div className="rounded-lg border border-border bg-surface px-5 py-8 text-center text-sm text-text-tertiary">
              {isGestor
                ? 'Nenhum rascunho ainda. Assuma o processo na mão para preencher o encaminhamento.'
                : 'Nenhum rascunho gerado para este processo ainda.'}
            </div>
          )}

          {/* Do mais novo para o mais antigo, cada um fechado: um processo pode
              juntar várias análises, e abertas elas empurravam os documentos
              para longe. O cabeçalho já diz a pauta e a situação; abre quem
              quiser ver o conteúdo. */}
          <div className="space-y-3">
            {rascunhos.map((rascunho) => {
              const avisos = avisosDeAprovacao({
                pauta: rascunho.pauta,
                ehMaisRecente: rascunho.id === maisRecente?.id,
                pautaMaisRecente: maisRecente?.pauta ?? null,
                publicacaoAtual: dataPauta ? { pauta: dataPauta, status: processo.pje_status } : null,
                criaTarefa: rascunho.status_sugerido !== 'AGUARDAR',
                tarefasAbertas,
              })
              return (
                <details key={rascunho.id} className="group rounded-lg border border-border bg-surface">
                  <summary className="flex list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-text">
                          {rascunho.pauta ? `Análise da pauta de ${formatDataPauta(rascunho.pauta)}` : 'Análise sem pauta registrada'}
                        </span>
                        {rascunhos.length > 1 && rascunho.id === maisRecente?.id && (
                          <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">mais recente</span>
                        )}
                        {rascunho.status === 'aprovado' && (
                          <span className="text-xs text-ok">Aprovado em {formatDateTime(rascunho.data_revisao)}</span>
                        )}
                        {rascunho.status === 'rejeitado' && (
                          <span className="text-xs text-danger">Rejeitado em {formatDateTime(rascunho.data_revisao)}</span>
                        )}
                        {rascunho.status === 'pendente' && (
                          <span className="text-xs text-warn">Aguardando aprovação</span>
                        )}
                      </div>
                      {rascunho.proxima_acao && (
                        <p className="mt-1 truncate text-xs text-text-tertiary">{rascunho.proxima_acao}</p>
                      )}
                    </div>
                    <Seta />
                  </summary>
                  <div className="px-4 pb-4">
                    <RascunhoDetalhe
                      rascunho={rascunho}
                      processoId={id}
                      usuarios={usuarios}
                      responsavelNome={nomeDoUsuario(rascunho.responsavel_sugerido_id)}
                      dataPublicacao={rascunho.pauta ?? processo.lote_id ?? processo.data_entrada}
                      avisosAprovacao={avisos}
                      somenteLeitura={!isGestor || rascunho.status !== 'pendente'}
                    />
                  </div>
                </details>
              )
            })}
          </div>
        </section>

        {tarefas.length > 0 && (
          <section>
            {/* Toda aprovação cria a sua tarefa; aqui ficam todas as do processo,
                cada uma dizendo de qual análise veio. Fechada pelo mesmo motivo
                das análises. */}
            <details className="group rounded-lg border border-border bg-surface">
              <summary className="flex list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="flex-1 text-base font-semibold text-text">
                  Tarefas deste processo
                  <span className="ml-2 text-sm font-normal text-text-tertiary">
                    {tarefasAbertas.length} aberta{tarefasAbertas.length !== 1 ? 's' : ''} · {tarefas.length} no total
                  </span>
                </span>
                <Seta />
              </summary>
              <ul className="space-y-3 px-4 pb-4">
                {tarefas.map((tarefa) => {
                  const origem = rascunhos.find((r) => r.id === tarefa.rascunho_id)
                  const encaminhamentosDaTarefa = (encaminhamentos ?? []).filter((e) => e.tarefa_id === tarefa.id)
                  return (
                    <li key={tarefa.id} className="space-y-3 rounded-md border border-border bg-surface-raised px-4 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-medium text-text">
                          {origem?.pauta ? `Da análise da pauta de ${formatDataPauta(origem.pauta)}` : 'Tarefa'}
                        </span>
                        <span className={`text-xs ${tarefa.status_tarefa === 'aberta' ? 'text-warn' : 'text-ok'}`}>
                          {tarefa.status_tarefa === 'aberta'
                            ? 'Aberta'
                            : tarefa.concluida_em ? `Concluída em ${formatDate(tarefa.concluida_em)}` : 'Concluída'}
                        </span>
                      </div>
                      {tarefa.proxima_acao && (
                        <p className="text-sm font-medium text-text">{tarefa.proxima_acao}</p>
                      )}
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                        <div>
                          <dt className="text-text-tertiary">Responsável</dt>
                          <dd className="text-text-secondary">{tarefa.responsavel?.nome ?? '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-text-tertiary">Prazo fatal</dt>
                          <dd className="text-text-secondary">{tarefa.prazo_fatal ? formatDataPauta(tarefa.prazo_fatal.slice(0, 10)) : '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-text-tertiary">Prazo interno</dt>
                          <dd className="text-text-secondary">{tarefa.prazo_interno ? formatDataPauta(tarefa.prazo_interno.slice(0, 10)) : '—'}</dd>
                        </div>
                      </dl>
                      {encaminhamentosDaTarefa.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Encaminhamentos</h4>
                          <ol className="mt-1.5 space-y-1 text-sm text-text-secondary">
                            {encaminhamentosDaTarefa.map((e) => (
                              <li key={e.id} className="flex flex-wrap gap-x-2">
                                <span className="tabular-nums text-text-tertiary">{formatDateTime(e.criado_em)}</span>
                                <span>
                                  {e.de?.nome ?? '—'} → <span className="font-medium text-text">{e.para?.nome ?? '—'}</span>
                                </span>
                                {e.por?.nome && e.por.nome !== e.de?.nome && (
                                  <span className="text-text-tertiary">por {e.por.nome}</span>
                                )}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      <ObservacaoTarefa
                        tarefaId={tarefa.id}
                        observacoes={tarefa.observacoes}
                        podeEditar={isGestor || tarefa.responsavel_id === usuarioLogado.id}
                      />
                    </li>
                  )
                })}
              </ul>
            </details>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-text">Documentos extraídos</h2>
            {documentos.length > 0 && (
              <span className="text-xs text-text-tertiary">{documentos.length} documento{documentos.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          <DocumentosHistorico documentos={documentos} />
        </section>

      </div>
    </div>
  )
}
