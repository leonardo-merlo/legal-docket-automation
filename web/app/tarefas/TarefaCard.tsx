'use client'
// Needs client for loading state, edit form, and transitions

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { concluirTarefa, desconcluirTarefa, editarTarefa, encaminharTarefa, salvarObservacaoTarefa } from './actions'
import { statusLabel } from '@/lib/status'

export interface TarefaCardProps {
  id: string
  processoId: string | null
  numeroCnj: string
  statusProcesso: string | null
  responsavelNome: string
  responsavelId: string
  prazoFatal: string | null
  prazoInterno: string | null
  observacoes: string | null
  proximaAcao: string | null
  encaminhadaPor: string | null
  encaminhadaEm: string | null
  concluida: boolean
  usuarios: { id: string; nome: string }[]
  podeEditar: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function diasUteisRestantes(prazoFatalISO: string | null): number {
  if (!prazoFatalISO) return 999
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const [y, m, d] = prazoFatalISO.split('-').map(Number)
  const prazo = new Date(y, m - 1, d)
  if (prazo < hoje) return -1
  if (prazo.getTime() === hoje.getTime()) return 0
  let dias = 0
  const cursor = new Date(hoje)
  cursor.setDate(cursor.getDate() + 1)
  while (cursor <= prazo) {
    const dow = cursor.getDay()
    if (dow !== 0 && dow !== 6) dias++
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

function urgencia(dias: number): 'ok' | 'warn' | 'danger' {
  if (dias > 5) return 'ok'
  if (dias >= 2) return 'warn'
  return 'danger'
}

const URGENCIA_DOT: Record<string, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

const URGENCIA_TEXT: Record<string, string> = {
  ok: 'text-text',
  warn: 'text-warn',
  danger: 'text-danger',
}

const URGENCIA_LABEL: Record<string, string> = {
  ok: 'Dentro do prazo',
  warn: 'Atenção: prazo próximo',
  danger: 'Urgente',
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export default function TarefaCard({
  id,
  processoId,
  numeroCnj,
  statusProcesso,
  responsavelNome,
  responsavelId,
  prazoFatal,
  prazoInterno,
  observacoes,
  proximaAcao,
  encaminhadaPor,
  encaminhadaEm,
  concluida,
  usuarios,
  podeEditar,
}: TarefaCardProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [painel, setPainel] = useState<'encaminhar' | 'observacao' | null>(null)
  const [destino, setDestino] = useState('')
  const [observacao, setObservacao] = useState(observacoes ?? '')

  // campos editáveis
  const [editPrazoFatal, setEditPrazoFatal] = useState(prazoFatal ?? '')
  const [editPrazoInterno, setEditPrazoInterno] = useState(prazoInterno ?? '')
  const [editResponsavel, setEditResponsavel] = useState(responsavelId)
  const [editObs, setEditObs] = useState(observacoes ?? '')
  const [editProximaAcao, setEditProximaAcao] = useState(proximaAcao ?? '')

  // a cor acompanha o prazo em destaque, que agora é o interno
  const dias = diasUteisRestantes(prazoInterno ?? prazoFatal)
  const u = urgencia(dias)

  function handleConcluir() {
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await concluirTarefa(id)
        if (resultado.error) setError(resultado.error)
      } catch { setError('Erro ao concluir. Tente novamente.') }
    })
  }

  function handleDesconcluir() {
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await desconcluirTarefa(id)
        if (resultado.error) setError(resultado.error)
      } catch { setError('Erro ao reabrir. Tente novamente.') }
    })
  }

  function handleSalvar() {
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await editarTarefa(id, processoId, {
          prazo_fatal: editPrazoFatal || null,
          prazo_interno: editPrazoInterno || null,
          responsavel_id: editResponsavel,
          observacoes: editObs || null,
          proxima_acao: editProximaAcao || null,
        })
        if (resultado.error) {
          setError(resultado.error)
          return
        }
        setIsEditing(false)
      } catch {
        setError('Erro ao salvar. Tente novamente.')
      }
    })
  }

  function handleEncaminhar() {
    if (!destino) return
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await encaminharTarefa(id, destino)
        if (resultado.error) {
          setError(resultado.error)
          return
        }
        setPainel(null)
        setDestino('')
      } catch {
        setError('Erro ao encaminhar. Tente novamente.')
      }
    })
  }

  function handleSalvarObservacao() {
    setError(null)
    startTransition(async () => {
      try {
        const resultado = await salvarObservacaoTarefa(id, observacao)
        if (resultado.error) {
          setError(resultado.error)
          return
        }
        setPainel(null)
      } catch {
        setError('Erro ao salvar a observação. Tente novamente.')
      }
    })
  }

  if (isEditing && podeEditar) {
    return (
      <div className="px-4 py-4 border-b border-border-subtle last:border-0 bg-surface space-y-3">
        <p className="text-xs font-medium text-text-secondary">Editando: <span className="font-mono">{numeroCnj}</span></p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">Prazo fatal</label>
            <input
              type="date"
              value={editPrazoFatal}
              onChange={(e) => setEditPrazoFatal(e.target.value)}
              className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">Prazo interno</label>
            <input
              type="date"
              value={editPrazoInterno}
              onChange={(e) => setEditPrazoInterno(e.target.value)}
              className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-tertiary mb-1">Responsável</label>
          <select
            value={editResponsavel}
            onChange={(e) => setEditResponsavel(e.target.value)}
            className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
          >
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-text-tertiary mb-1">Próxima ação</label>
          <textarea
            value={editProximaAcao}
            onChange={(e) => setEditProximaAcao(e.target.value)}
            rows={2}
            className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div>
          <label className="block text-xs text-text-tertiary mb-1">Observações</label>
          <textarea
            value={editObs}
            onChange={(e) => setEditObs(e.target.value)}
            rows={2}
            className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent resize-none"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleSalvar}
            disabled={isPending}
            className="flex h-7 items-center gap-1.5 rounded bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {isPending ? <Spinner /> : 'Salvar'}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            disabled={isPending}
            className="flex h-7 items-center px-3 text-xs text-text-secondary border border-border rounded hover:bg-surface-raised disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (concluida) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0 opacity-60">
        <span className="w-2 h-2 rounded-full bg-ok shrink-0" />
        <div className="min-w-0 flex-1">
          {processoId ? (
            <Link href={`/processos/${processoId}`} className="font-mono text-xs text-text-secondary hover:text-text hover:underline">
              {numeroCnj}
            </Link>
          ) : (
            <span className="font-mono text-xs text-text-secondary">{numeroCnj}</span>
          )}
          <p className="text-xs text-text-tertiary mt-0.5">{responsavelNome}</p>
        </div>
        <span className="text-xs text-text-tertiary hidden sm:block">{formatDate(prazoFatal)}</span>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          onClick={handleDesconcluir}
          disabled={isPending}
          className="flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-50"
        >
          {isPending ? <Spinner /> : 'Desconcluir'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 border-b border-border-subtle last:border-0 hover:bg-surface transition-colors group sm:flex-nowrap">
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${URGENCIA_DOT[u]}`}
        title={URGENCIA_LABEL[u]}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {processoId ? (
            <Link
              href={`/processos/${processoId}`}
              className="font-mono text-xs text-text-secondary hover:text-text hover:underline transition-colors"
            >
              {numeroCnj}
            </Link>
          ) : (
            <span className="font-mono text-xs text-text-secondary">{numeroCnj}</span>
          )}
          {statusProcesso && (
            <span className="text-xs text-text-tertiary">
              {statusLabel(statusProcesso)}
            </span>
          )}
        </div>
        <p className={`text-xs tabular-nums mt-0.5 sm:hidden ${URGENCIA_TEXT[u]}`}>
          {formatDate(prazoInterno ?? prazoFatal)}
          {prazoInterno && <span className="text-text-tertiary"> · fatal {formatDate(prazoFatal)}</span>}
        </p>
        <p className="text-xs text-text-tertiary mt-0.5">
          {responsavelNome}
          {encaminhadaPor && (
            <span
              title={encaminhadaEm ? `Encaminhada em ${new Date(encaminhadaEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : undefined}
              className="ml-2 inline-flex items-center rounded bg-accent-subtle px-1.5 py-0.5 text-[11px] font-medium text-accent"
            >
              encaminhada por {encaminhadaPor}
            </span>
          )}
        </p>
        {observacoes && painel !== 'observacao' && (
          <p className="text-xs text-text-tertiary mt-2 italic truncate">{observacoes}</p>
        )}

        {painel === 'observacao' && (
          <div className="mt-2 space-y-2">
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              aria-label="Observação da tarefa"
              placeholder="Anote o que a equipe precisa saber sobre esta tarefa"
              className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleSalvarObservacao} disabled={isPending} className="flex h-7 items-center gap-1.5 rounded bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50">
                {isPending ? <Spinner /> : 'Salvar observação'}
              </button>
              <button
                onClick={() => { setObservacao(observacoes ?? ''); setPainel(null) }}
                disabled={isPending}
                className="flex h-7 items-center px-3 text-xs text-text-secondary border border-border rounded hover:bg-surface-raised disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {painel === 'encaminhar' && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              aria-label="Encaminhar para"
              className="rounded border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
            >
              <option value="">Encaminhar para…</option>
              {usuarios
                .filter((usuario) => usuario.id !== responsavelId)
                .map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>{usuario.nome}</option>
                ))}
            </select>
            <button onClick={handleEncaminhar} disabled={isPending || !destino} className="flex h-7 items-center gap-1.5 rounded bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50">
              {isPending ? <Spinner /> : 'Encaminhar'}
            </button>
            <button
              onClick={() => { setDestino(''); setPainel(null) }}
              disabled={isPending}
              className="flex h-7 items-center px-3 text-xs text-text-secondary border border-border rounded hover:bg-surface-raised disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 text-right hidden sm:block">
        <p className={`text-sm font-medium tabular-nums ${URGENCIA_TEXT[u]}`}>
          {formatDate(prazoInterno ?? prazoFatal)}
        </p>
        {prazoInterno && (
          <p className="text-xs text-text-tertiary">
            fatal: {formatDate(prazoFatal)}
          </p>
        )}
      </div>

      <div className="flex basis-full flex-wrap items-center justify-end gap-1.5 sm:basis-auto sm:shrink-0 sm:flex-nowrap">
        <button
          onClick={() => { setObservacao(observacoes ?? ''); setPainel(painel === 'observacao' ? null : 'observacao') }}
          disabled={isPending}
          className="flex h-7 items-center px-3 text-xs text-text-secondary border border-border rounded hover:bg-surface-raised disabled:opacity-50"
        >
          Observação
        </button>
        <button
          onClick={() => setPainel(painel === 'encaminhar' ? null : 'encaminhar')}
          disabled={isPending}
          className="flex h-7 items-center px-3 text-xs text-text-secondary border border-border rounded hover:bg-surface-raised disabled:opacity-50"
        >
          Encaminhar
        </button>
        {podeEditar && (
          <button
            onClick={() => setIsEditing(true)}
            disabled={isPending}
            className="flex h-7 items-center px-3 text-xs text-text-secondary border border-border rounded hover:bg-surface-raised disabled:opacity-50"
          >
            Editar
          </button>
        )}
        <button
          onClick={handleConcluir}
          disabled={isPending}
          className="flex h-7 items-center gap-1.5 rounded border border-border px-3 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-50"
        >
          {isPending ? <Spinner /> : 'Concluir'}
        </button>
      </div>
      {error && <p className="basis-full text-xs text-danger sm:text-right">{error}</p>}
    </div>
  )
}
