'use client'
// Needs client for the confirm/report form state and save transition

import { useState, useTransition } from 'react'
import { conferirEmail } from './actions'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export default function ConferenciaEmail({
  emailId,
  totalProcessos,
  status,
  processosErrados,
  comentario,
  conferidoPor,
  conferidoEm,
}: {
  emailId: string
  totalProcessos: number
  status: string | null
  processosErrados: number | null
  comentario: string | null
  conferidoPor: string | null
  conferidoEm: string | null
}) {
  const [relatando, setRelatando] = useState(false)
  const [errados, setErrados] = useState(processosErrados?.toString() ?? '')
  const [texto, setTexto] = useState(comentario ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function enviar(novo: 'ok' | 'com_erro') {
    setErro(null)
    startTransition(async () => {
      try {
        const resultado = await conferirEmail(emailId, {
          status: novo,
          processosErrados: novo === 'com_erro' && errados !== '' ? Number(errados) : null,
          comentario: novo === 'com_erro' ? texto : '',
        })
        if (resultado.error) {
          setErro(resultado.error)
          return
        }
        setRelatando(false)
      } catch {
        setErro('Erro ao salvar. Tente novamente.')
      }
    })
  }

  const quem = conferidoPor && conferidoEm ? ` · ${conferidoPor}, ${formatDateTime(conferidoEm)}` : ''

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div>
        <h2 className="text-sm font-medium text-text">Conferência</h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          Os {totalProcessos} processo{totalProcessos !== 1 ? 's' : ''} deste e-mail chegaram certos?
        </p>
      </div>

      {status === 'ok' && !relatando && (
        <p className="rounded-md bg-ok-subtle px-3 py-2 text-sm text-ok">Conferido: todos certos{quem}</p>
      )}
      {status === 'com_erro' && !relatando && (
        <div className="rounded-md bg-warn-subtle px-3 py-2 text-sm text-warn">
          <p>{processosErrados ?? 0} de {totalProcessos} vieram errados{quem}</p>
          {comentario && <p className="mt-1 whitespace-pre-wrap text-text-secondary">{comentario}</p>}
        </div>
      )}

      {relatando ? (
        <div className="space-y-2">
          <label className="block text-xs text-text-tertiary">
            Quantos processos vieram errados?
            <input
              type="number"
              min={0}
              max={totalProcessos}
              value={errados}
              onChange={(e) => setErrados(e.target.value)}
              className="mt-1 block w-24 rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
            />
          </label>
          <label className="block text-xs text-text-tertiary">
            O que veio errado?
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Ex.: faltou o processo 5001234-...; a parte do 5004204 veio trocada"
              className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-y"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => enviar('com_erro')}
              disabled={isPending}
              className="flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
            >
              {isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => { setRelatando(false); setErro(null) }}
              disabled={isPending}
              className="flex h-8 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:bg-surface-raised disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {status !== 'ok' && (
            <button
              type="button"
              onClick={() => enviar('ok')}
              disabled={isPending}
              className="flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent/90 disabled:opacity-50"
            >
              {isPending ? 'Salvando…' : 'Tudo certo'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setRelatando(true)}
            disabled={isPending}
            className="flex h-8 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:bg-surface-raised disabled:opacity-50"
          >
            {status === 'com_erro' ? 'Editar o que veio errado' : 'Algo veio errado'}
          </button>
        </div>
      )}

      {erro && <p className="text-xs text-danger">{erro}</p>}
    </section>
  )
}
