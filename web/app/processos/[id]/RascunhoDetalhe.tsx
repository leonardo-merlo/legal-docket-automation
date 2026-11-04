'use client'
// Needs client for edit form state, reject confirmation dialog, and action transitions

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tables } from '@/lib/supabase/types'
import { aprovarRascunho, rejeitarRascunho, editarRascunho } from './actions'
import { formatPrazoDate } from '@/lib/prazo'
import {
  CENARIO_PRAZO_LABEL,
  RISCO_STYLE,
  STATUS_OPTIONS,
  riscoLabel,
  statusLabel,
} from '@/lib/status'
import { MOTIVOS } from '@/lib/revisao'

type RascunhoRow = Tables<'rascunhos'>

type Usuario = { id: string; nome: string }

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function EditadoBadge() {
  return (
    <span
      title="Editado manualmente"
      className="ml-1.5 inline-block rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary"
    >
      editado
    </span>
  )
}

/**
 * Rótulo dos blocos do rascunho. Existe porque a tela tem muito cartão e, sem
 * título, "Representamos a AUTORA..." podia passar por resposta a ser enviada
 * quando é o raciocínio da IA.
 */
function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
      {children}
    </h3>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

const INPUT = 'w-full rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-text focus:outline-none focus:border-accent'
const LABEL = 'mb-1 block text-xs text-text-tertiary'

export default function RascunhoDetalhe({
  rascunho,
  processoId,
  usuarios,
  responsavelNome,
  dataPublicacao,
  avisosAprovacao = [],
  somenteLeitura = false,
}: {
  rascunho: RascunhoRow
  processoId: string
  usuarios: Usuario[]
  responsavelNome: string
  /** Pauta que este rascunho analisou: é dela que o prazo conta. */
  dataPublicacao: string | null
  /** Ver lib/avisos-aprovacao.ts. Só pedem confirmação. */
  avisosAprovacao?: string[]
  somenteLeitura?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showAguardarConfirm, setShowAguardarConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<'aprovar' | 'rejeitar' | 'editar' | null>(null)

  const [motivosRejeicao, setMotivosRejeicao] = useState<string[]>([])
  const [comentarioRejeicao, setComentarioRejeicao] = useState('')

  const [statusSugerido, setStatusSugerido] = useState(rascunho.status_sugerido ?? '')
  const [responsavelId, setResponsavelId] = useState(rascunho.responsavel_sugerido_id ?? '')
  const [prazoFatal, setPrazoFatal] = useState(rascunho.prazo_fatal_dias_uteis?.toString() ?? '')
  const [prazoInterno, setPrazoInterno] = useState(rascunho.prazo_interno_dias_uteis?.toString() ?? '')
  const [proximaAcao, setProximaAcao] = useState(rascunho.proxima_acao ?? '')
  const [alerta, setAlerta] = useState(rascunho.alerta ?? '')

  const camposEditados = new Set(rascunho.campos_editados_manualmente ?? [])

  const isAguardar = rascunho.status_sugerido === 'AGUARDAR'

  if (somenteLeitura && isEditing) setIsEditing(false)

  function handleAprovarClick() {
    // AGUARDAR não gera tarefa — apenas registra e some. Confirmar antes. Os
    // avisos (análise antiga, publicação nova, tarefa aberta) também.
    if (isAguardar || avisosAprovacao.length > 0) {
      setShowAguardarConfirm(true)
      return
    }
    handleAprovar()
  }

  function handleAprovar() {
    setShowAguardarConfirm(false)
    setPendingAction('aprovar')
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await aprovarRascunho(rascunho.id, processoId)
        if (resultado.error) {
          setError(resultado.error)
          setPendingAction(null)
        }
      } catch {
        setError('Erro ao aprovar. Tente novamente.')
        setPendingAction(null)
      }
    })
  }

  function alternarMotivo(motivo: string) {
    setMotivosRejeicao((atuais) =>
      atuais.includes(motivo) ? atuais.filter((m) => m !== motivo) : [...atuais, motivo]
    )
  }

  function handleRejeitar() {
    setPendingAction('rejeitar')
    setError(null)
    setShowConfirm(false)
    startTransition(async () => {
      try {
        const resultado = await rejeitarRascunho(rascunho.id, processoId, {
          motivos: motivosRejeicao,
          comentario: comentarioRejeicao.trim() || null,
        })
        if (resultado.error) {
          setError(resultado.error)
          setPendingAction(null)
        }
      } catch {
        setError('Erro ao rejeitar. Tente novamente.')
        setPendingAction(null)
      }
    })
  }

  function iniciarEdicao() {
    setStatusSugerido(rascunho.status_sugerido ?? '')
    setError(null)
    setIsEditing(true)
  }

  function handleSalvarEdicao() {
    setPendingAction('editar')
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await editarRascunho(rascunho.id, processoId, {
          status_sugerido: statusSugerido || null,
          responsavel_sugerido_id: responsavelId || null,
          prazo_fatal_dias_uteis: prazoFatal ? parseInt(prazoFatal, 10) : null,
          prazo_interno_dias_uteis: prazoInterno ? parseInt(prazoInterno, 10) : null,
          proxima_acao: proximaAcao.trim() || null,
          // o passo a passo e o "por que" saíram da tela (reunião de 09/10/2026);
          // a justificativa da IA segue gravada, sem edição
          justificativa: rascunho.justificativa,
          alerta: alerta.trim() || null,
        })
        if (resultado.error) {
          setError(resultado.error)
          setPendingAction(null)
          return
        }

        setIsEditing(false)
        setPendingAction(null)
        router.refresh()
      } catch {
        setError('Erro ao salvar. Tente novamente.')
        setPendingAction(null)
      }
    })
  }

  const isLoading = isPending && pendingAction !== null

  if (isEditing) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold text-text">Editar rascunho</h3>

        <div className="space-y-4">
          <div>
            <label className={LABEL}>Status sugerido</label>
            <select
              value={statusSugerido}
              onChange={(e) => setStatusSugerido(e.target.value)}
              className={INPUT}
            >
              {/* Rascunho feito na mão nasce sem status: sem esta opção o seletor
                  mostrava "Contestação" e enviava vazio. */}
              {!statusSugerido && <option value="">— selecionar —</option>}
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL}>Texto da sugestão</label>
            <textarea
              value={proximaAcao}
              onChange={(e) => setProximaAcao(e.target.value)}
              rows={3}
              placeholder="ex: SANEAR IRREGULARIDADES NA CERTIDÃO DE TRIAGEM até 27/07/2026..."
              className={INPUT}
            />
          </div>

          <div>
            <label className={LABEL}>Responsável</label>
            <select
              value={responsavelId}
              onChange={(e) => setResponsavelId(e.target.value)}
              className={INPUT}
            >
              <option value="">— selecionar —</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Prazo fatal (dias úteis)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={prazoFatal}
                onChange={(e) => setPrazoFatal(e.target.value)}
                placeholder="ex: 15"
                className={INPUT}
              />
            </div>
            <div>
              <label className={LABEL}>Prazo interno (dias úteis)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={prazoInterno}
                onChange={(e) => setPrazoInterno(e.target.value)}
                placeholder="ex: 12"
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Atenção crítica</label>
            <textarea
              value={alerta}
              onChange={(e) => setAlerta(e.target.value)}
              rows={4}
              placeholder="Deixe em branco se não houver nada a ressalvar."
              className={INPUT}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={handleSalvarEdicao}
            disabled={isLoading}
            className="flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && pendingAction === 'editar' ? (
              <span className="flex items-center gap-2"><Spinner />Salvando…</span>
            ) : 'Salvar'}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            disabled={isLoading}
            className="flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-text-secondary hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          {rascunho.cenario_prazo && (
            <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
              {CENARIO_PRAZO_LABEL[rascunho.cenario_prazo] ?? rascunho.cenario_prazo}
            </span>
          )}
          {rascunho.classificacao_risco && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISCO_STYLE[rascunho.classificacao_risco] ?? 'bg-surface-raised text-text-secondary'}`}>
              {riscoLabel(rascunho.classificacao_risco)}
            </span>
          )}
        </div>

        {rascunho.proxima_acao && (
          <div className="mt-3">
            <Titulo>
              O que fazer
              {camposEditados.has('proxima_acao') && <EditadoBadge />}
            </Titulo>
            <div className="mt-1.5 rounded-md border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-text">
              {rascunho.proxima_acao}
            </div>
          </div>
        )}

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-text-tertiary">
              Status sugerido
              {camposEditados.has('status_sugerido') && <EditadoBadge />}
            </dt>
            <dd className="font-medium text-text">{statusLabel(rascunho.status_sugerido)}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">
              Responsável
              {camposEditados.has('responsavel_sugerido_id') && <EditadoBadge />}
            </dt>
            <dd className="text-text-secondary">{responsavelNome}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">
              Prazo fatal
              {camposEditados.has('prazo_fatal_dias_uteis') && <EditadoBadge />}
            </dt>
            <dd className="text-text-secondary">{formatPrazoDate(dataPublicacao, rascunho.prazo_fatal_dias_uteis)}</dd>
          </div>
          <div>
            <dt className="text-text-tertiary">
              Prazo interno
              {camposEditados.has('prazo_interno_dias_uteis') && <EditadoBadge />}
            </dt>
            <dd className="text-text-secondary">{formatPrazoDate(dataPublicacao, rascunho.prazo_interno_dias_uteis)}</dd>
          </div>
        </dl>

        {rascunho.editado_manualmente_em && (
          <p className="mt-2 text-[11px] text-text-tertiary">
            Editado manualmente em {formatDateTime(rascunho.editado_manualmente_em)}
          </p>
        )}

        {rascunho.alerta && (
          <div className="mt-4">
            <Titulo>
              Atenção crítica
              {camposEditados.has('alerta') && <EditadoBadge />}
            </Titulo>
            <div className="mt-1.5 rounded-md border border-warn/40 bg-warn-subtle px-3 py-2 text-sm text-warn">
              {rascunho.alerta}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        {!somenteLeitura && (
          <div className="mt-5 flex gap-3">
            <button
              onClick={handleAprovarClick}
              disabled={isLoading}
              className="flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && pendingAction === 'aprovar' ? (
                <span className="flex items-center gap-2"><Spinner />{isAguardar ? 'Concluindo…' : 'Aprovando…'}</span>
              ) : (isAguardar ? 'Concluir (aguardar)' : 'Aprovar')}
            </button>

            <button
              onClick={iniciarEdicao}
              disabled={isLoading}
              className="flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-text-secondary hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
            >
              Editar
            </button>

            <button
              onClick={() => setShowConfirm(true)}
              disabled={isLoading}
              className="flex h-9 items-center justify-center rounded-md border border-danger/40 px-4 text-sm font-medium text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && pendingAction === 'rejeitar' ? (
                <span className="flex items-center gap-2"><Spinner />Rejeitando…</span>
              ) : 'Rejeitar'}
            </button>
          </div>
        )}
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface-raised p-6 shadow-xl">
            <h3 className="text-base font-semibold text-text">Rejeitar rascunho?</h3>
            <p className="mt-2 text-sm text-text-secondary">
              O rascunho será arquivado como rejeitado. Marque o que não funcionou — é
              o que permite corrigir a análise no mês seguinte.
            </p>

            <fieldset className="mt-4">
              <legend className="text-xs font-medium text-text-secondary">
                O que estava errado? <span className="font-normal text-text-tertiary">(ao menos um)</span>
              </legend>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {MOTIVOS.map((motivo) => (
                  <label
                    key={motivo.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-text-secondary hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={motivosRejeicao.includes(motivo.value)}
                      onChange={() => alternarMotivo(motivo.value)}
                      className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    />
                    {motivo.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-4">
              <label htmlFor="comentario-rejeicao" className="mb-1 block text-xs font-medium text-text-secondary">
                Comentário <span className="font-normal text-text-tertiary">(opcional)</span>
              </label>
              <textarea
                id="comentario-rejeicao"
                value={comentarioRejeicao}
                onChange={(e) => setComentarioRejeicao(e.target.value)}
                rows={3}
                placeholder="ex: o prazo era da parte contrária, não nosso"
                className={INPUT}
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleRejeitar}
                disabled={motivosRejeicao.length === 0}
                className="flex h-9 items-center justify-center rounded-md bg-danger px-4 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirmar rejeição
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-text-secondary hover:bg-surface"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showAguardarConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-6 shadow-xl">
            <h3 className="text-base font-semibold text-text">
              {isAguardar ? 'Concluir sem criar tarefa?' : 'Aprovar este rascunho?'}
            </h3>
            {isAguardar && (
              <p className="mt-2 text-sm text-text-secondary">
                Este rascunho está como <span className="font-medium text-text">Aguardar</span> — não há prazo a cumprir pelo escritório agora.
                Ao confirmar, a próxima ação fica registrada no processo e o rascunho sai da fila <span className="font-medium text-text">sem gerar tarefa</span>.
              </p>
            )}
            {avisosAprovacao.map((aviso) => (
              <p key={aviso} className="mt-3 rounded-md border border-warn/40 bg-warn-subtle px-3 py-2 text-sm text-warn">
                {aviso}
              </p>
            ))}
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleAprovar}
                className="flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"
              >
                {avisosAprovacao.length > 0 ? (isAguardar ? 'Concluir mesmo assim' : 'Aprovar mesmo assim') : 'Confirmar'}
              </button>
              <button
                onClick={() => setShowAguardarConfirm(false)}
                className="flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-text-secondary hover:bg-surface"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
