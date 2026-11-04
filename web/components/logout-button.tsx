'use client'
// precisa de useTransition para mostrar estado de carregamento durante o logout

import { useTransition } from 'react'
import { logout } from '@/app/login/actions-logout'

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => logout())}
      disabled={isPending}
      className="text-sm text-text-tertiary hover:text-text disabled:opacity-50"
    >
      {isPending ? 'Saindo…' : 'Sair'}
    </button>
  )
}
