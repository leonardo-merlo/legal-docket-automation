'use client'
// precisa de useActionState para mostrar erro de validacao sem reload cheio,
// e useEffect para ler a sessao do fragmento da URL (#access_token=...) que o
// template padrao do Supabase devolve — sem SMTP proprio nao da pra customizar
// o template pra usar o fluxo de token_hash na query string, entao a sessao so
// existe no fragmento e precisa ser promovida a cookie aqui no client antes do
// server action conseguir enxergar o usuario logado.

import { useActionState, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { definirSenha, type DefinirSenhaState } from '@/lib/auth/definir-senha'

const ESTADO_INICIAL: DefinirSenhaState = {}

export default function DefinirSenhaForm({
  titulo,
  textoBotao,
}: {
  titulo: string
  textoBotao: string
}) {
  const [state, formAction, pending] = useActionState(definirSenha, ESTADO_INICIAL)
  const [sessaoPronta, setSessaoPronta] = useState(false)
  const [erroLink, setErroLink] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (params.get('error')) {
      setErroLink('Link inválido ou expirado. Solicite um novo.')
      return
    }

    if (!accessToken || !refreshToken) {
      setSessaoPronta(true)
      return
    }

    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        window.history.replaceState(null, '', window.location.pathname)
        if (error) setErroLink('Link inválido ou expirado. Solicite um novo.')
        else setSessaoPronta(true)
      })
  }, [])

  if (erroLink) {
    return <p className="text-sm text-danger text-center">{erroLink}</p>
  }

  if (!sessaoPronta) {
    return <p className="text-sm text-text-secondary text-center">Verificando link…</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-text text-center">{titulo}</h1>
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="senha" className="block text-sm text-text-secondary mb-1">
            Nova senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label htmlFor="confirmacao" className="block text-sm text-text-secondary mb-1">
            Confirmar senha
          </label>
          <input
            id="confirmacao"
            name="confirmacao"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
          />
        </div>
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-text px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          {pending ? 'Salvando…' : textoBotao}
        </button>
      </form>
    </div>
  )
}
