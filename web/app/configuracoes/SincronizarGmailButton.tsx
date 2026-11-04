'use client'
// precisa de useTransition para mostrar "Sincronizando…" e o resultado sem recarregar a página

import { useState, useTransition } from 'react'
import { sincronizarGmailAgora, type SincronizarGmailState } from './actions'

export default function SincronizarGmailButton() {
  const [pendente, iniciar] = useTransition()
  const [estado, setEstado] = useState<SincronizarGmailState>({})

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pendente}
        onClick={() => iniciar(async () => setEstado(await sincronizarGmailAgora()))}
        className="rounded border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-raised disabled:opacity-50"
      >
        {pendente ? 'Sincronizando…' : 'Sincronizar agora'}
      </button>
      {estado.mensagem && <span className="text-xs text-ok">{estado.mensagem}</span>}
      {estado.erro && <span className="text-xs text-danger">{estado.erro}</span>}
    </div>
  )
}
