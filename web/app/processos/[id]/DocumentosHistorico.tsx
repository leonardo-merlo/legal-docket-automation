'use client'
// Needs client for accordion expand/collapse state

import { useState } from 'react'
import { Tables } from '@/lib/supabase/types'

type Documento = Tables<'documentos'>

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function DocumentoItem({ doc }: { doc: Documento }) {
  const [open, setOpen] = useState(false)
  const temTexto = !!doc.texto && !doc.erro

  return (
    <li className="rounded-lg border border-border bg-surface shadow-sm">
      <button
        onClick={() => temTexto && setOpen((v) => !v)}
        disabled={!temTexto}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
          temTexto ? 'cursor-pointer hover:bg-surface' : 'cursor-default'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {doc.titulo ?? `Doc. ${doc.indice}`}
            {doc.numero_documento && (
              <span className="ml-2 font-mono text-xs font-normal text-text-tertiary">#{doc.numero_documento}</span>
            )}
          </p>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-text-tertiary">
            {doc.data_documento && <span>{doc.data_documento}</span>}
            {doc.juntado_por && (
              <span className="truncate">
                {doc.juntado_por}
                {doc.cargo && <span className="ml-1 text-text-tertiary">· {doc.cargo}</span>}
              </span>
            )}
          </div>
        </div>

        {doc.erro ? (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
            {doc.erro.startsWith('download_falhou') ? 'falha no download' : doc.erro}
          </span>
        ) : temTexto ? (
          <ChevronIcon open={open} />
        ) : (
          <span className="shrink-0 text-xs text-text-tertiary">sem texto</span>
        )}
      </button>

      {open && temTexto && (
        <div className="border-t border-border-subtle px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
            {doc.texto}
          </p>
        </div>
      )}
    </li>
  )
}

export default function DocumentosHistorico({ documentos }: { documentos: Documento[] }) {
  if (documentos.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-5 py-8 text-center text-sm text-text-tertiary">
        Nenhum documento extraído para este processo.
      </div>
    )
  }

  return (
    <ol className="space-y-2">
      {documentos.map((doc) => (
        <DocumentoItem key={doc.id} doc={doc} />
      ))}
    </ol>
  )
}
