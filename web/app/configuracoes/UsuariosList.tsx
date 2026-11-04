'use client'
// precisa de useTransition para o toggle de ativar/desativar sem reload cheio

import { useState, useTransition } from 'react'
import { alternarAtivoUsuario } from './actions'

type UsuarioRow = {
  id: string
  nome: string
  email: string
  papel: string
  ativo: boolean
  auth_user_id: string | null
}

const PAPEL_LABEL: Record<string, string> = {
  gestor: 'Gestor',
  advogado: 'Advogado',
  estagiario: 'Estagiário',
}

export default function UsuariosList({ usuarios }: { usuarios: UsuarioRow[] }) {
  const [isPending, startTransition] = useTransition()
  const [erroId, setErroId] = useState<string | null>(null)
  const [erroMensagem, setErroMensagem] = useState<string>('Erro ao atualizar.')

  function handleToggle(id: string, ativoAtual: boolean) {
    if (ativoAtual && !window.confirm('Tem certeza que deseja desativar o acesso deste usuário?')) {
      return
    }
    setErroId(null)
    startTransition(async () => {
      try {
        const resultado = await alternarAtivoUsuario(id, !ativoAtual)
        if (resultado.error) {
          setErroMensagem(resultado.error)
          setErroId(id)
        }
      } catch {
        setErroMensagem('Erro ao atualizar. Tente novamente.')
        setErroId(id)
      }
    })
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <ul>
        {usuarios.map((u) => (
          <li
            key={u.id}
            className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text">{u.nome}</p>
              <p className="text-xs text-text-tertiary">
                {u.email} · {PAPEL_LABEL[u.papel] ?? u.papel}
                {!u.auth_user_id && ' · convite pendente'}
              </p>
            </div>
            {erroId === u.id && <p className="text-xs text-danger">{erroMensagem}</p>}
            <button
              onClick={() => handleToggle(u.id, u.ativo)}
              disabled={isPending}
              className={`h-7 shrink-0 rounded border px-3 text-xs disabled:opacity-50 ${
                u.ativo
                  ? 'border-border text-text-secondary hover:bg-surface-raised'
                  : 'border-accent text-accent hover:bg-accent-subtle'
              }`}
            >
              {u.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
