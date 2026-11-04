'use client'
// precisa de useActionState para mostrar erro de login sem reload cheio da pagina

import { useActionState } from 'react'
import { login, type LoginState } from './actions'

const ESTADO_INICIAL: LoginState = {}

export default function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, ESTADO_INICIAL)

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="block text-sm text-text-secondary mb-1">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <label htmlFor="senha" className="block text-sm text-text-secondary mb-1">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
        />
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-text px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      <div className="text-center">
        <a href="/esqueci-senha" className="text-sm text-text-tertiary hover:text-text">
          Esqueci minha senha
        </a>
      </div>
    </form>
  )
}
