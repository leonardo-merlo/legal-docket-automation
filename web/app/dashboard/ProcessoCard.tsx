'use client'
// Needs client for loading state on action buttons

import { useState, useTransition } from 'react'
import { Tables } from '@/lib/supabase/types'
import { atualizarStatus } from './actions'
import { pjeStatusInfo } from '@/lib/status'

type ProcessoRow = Tables<'processos'>

interface ProcessoCardProps {
  processo: ProcessoRow
}

const SISTEMA_LABEL: Record<string, string> = {
  pje: 'PJE TJMG',
  eproc_tjmg: 'EPROC TJMG',
  eproc_trf6: 'EPROC TRF6',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

export default function ProcessoCard({ processo }: ProcessoCardProps) {
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<'aprovar' | 'rejeitar' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleClick(action: 'aprovar' | 'rejeitar') {
    const novoStatus = action === 'aprovar' ? 'EM_ANDAMENTO' : 'ARQUIVADO'
    setPendingAction(action)
    setError(null)

    startTransition(async () => {
      try {
        const resultado = await atualizarStatus(processo.numero_cnj, novoStatus)
        if (resultado.error) {
          setError(resultado.error)
          setPendingAction(null)
        }
      } catch {
        setError('Erro ao atualizar processo. Tente novamente.')
        setPendingAction(null)
      }
    })
  }

  const isLoading = isPending && pendingAction !== null
  const statusInfo = pjeStatusInfo(processo.pje_status)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm font-semibold text-zinc-900">{processo.numero_cnj}</p>

        {processo.sistema && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {SISTEMA_LABEL[processo.sistema] ?? processo.sistema}
          </span>
        )}

        {processo.tipo && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {processo.tipo}
          </span>
        )}

        {statusInfo && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-zinc-400">Recebido em</dt>
          <dd className="text-zinc-700">{formatDate(processo.data_criacao)}</dd>
        </div>

        <div>
          <dt className="text-zinc-400">Status</dt>
          <dd className="capitalize text-zinc-700">{processo.status_atual ?? '—'}</dd>
        </div>

        {processo.polo_ativo && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-zinc-400">Polo ativo</dt>
            <dd className="truncate text-zinc-700">{processo.polo_ativo}</dd>
          </div>
        )}

        {processo.polo_passivo && (
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-zinc-400">Polo passivo</dt>
            <dd className="truncate text-zinc-700">{processo.polo_passivo}</dd>
          </div>
        )}
      </dl>

      {processo.observacoes && (
        <p className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          {processo.observacoes}
        </p>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          onClick={() => handleClick('aprovar')}
          disabled={isLoading}
          className="flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && pendingAction === 'aprovar' ? (
            <span className="flex items-center gap-2">
              <Spinner />
              Aprovando…
            </span>
          ) : (
            'Em andamento'
          )}
        </button>

        <button
          onClick={() => handleClick('rejeitar')}
          disabled={isLoading}
          className="flex h-9 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending && pendingAction === 'rejeitar' ? (
            <span className="flex items-center gap-2">
              <Spinner />
              Arquivando…
            </span>
          ) : (
            'Arquivar'
          )}
        </button>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
