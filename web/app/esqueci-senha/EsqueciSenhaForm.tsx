'use client'

import { useActionState } from 'react'
import { solicitarReset, type EsqueciSenhaState } from './actions'

const ESTADO_INICIAL: EsqueciSenhaState = {}

export default function EsqueciSenhaForm() {
  const [state, formAction, pending] = useActionState(solicitarReset, ESTADO_INICIAL)

  if (state.mensagem) {
    return <p className="text-sm text-text-secondary">{state.mensagem}</p>
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm text-text-secondary mb-1">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-text px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Enviar link de redefinição'}
      </button>
    </form>
  )
}
