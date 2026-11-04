'use client'
// precisa de useActionState para mostrar erro/sucesso do convite sem reload cheio

import { useActionState, useEffect, useRef } from 'react'
import { convidarUsuario, type ConvidarUsuarioState } from './actions'

const ESTADO_INICIAL: ConvidarUsuarioState = {}

export default function ConvidarUsuarioForm() {
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(convidarUsuario, ESTADO_INICIAL)

  useEffect(() => {
    if (state.sucesso) formRef.current?.reset()
  }, [state])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end"
    >
      <div>
        <label htmlFor="nome" className="block text-xs text-text-tertiary mb-1">
          Nome
        </label>
        <input
          id="nome"
          name="nome"
          required
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="email" className="block text-xs text-text-tertiary mb-1">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="papel" className="block text-xs text-text-tertiary mb-1">
          Papel
        </label>
        <select
          id="papel"
          name="papel"
          defaultValue="advogado"
          className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        >
          <option value="gestor">Gestor</option>
          <option value="advogado">Advogado</option>
          <option value="estagiario">Estagiário</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-[38px] rounded-md bg-text px-4 text-sm font-medium text-bg disabled:opacity-50"
      >
        {pending ? 'Enviando…' : 'Convidar'}
      </button>
      {state.error && <p className="sm:col-span-4 text-sm text-danger">{state.error}</p>}
      {state.sucesso && (
        <p className="sm:col-span-4 text-sm text-ok">Convite enviado com sucesso.</p>
      )}
    </form>
  )
}
