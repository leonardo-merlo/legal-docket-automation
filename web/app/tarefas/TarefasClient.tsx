'use client'
// Needs client for dropdown user selector (useSearchParams + useRouter for URL sync), search and sort state

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tables } from '@/lib/supabase/types'
import { casaComBusca } from '@/lib/busca'
import { statusLabel } from '@/lib/status'
import TarefaCard from './TarefaCard'

type UsuarioRow = Pick<Tables<'usuarios'>, 'id' | 'nome' | 'papel'>

type TarefaComJoins = {
  id: string
  rascunho_id: string
  processo_id: string
  responsavel_id: string
  prazo_fatal: string | null
  prazo_interno: string | null
  status_tarefa: string | null
  observacoes: string | null
  encaminhada_em: string | null
  processo: {
    id: string
    numero_cnj: string
    status_atual: string | null
    proxima_acao: string | null
    polo_ativo: string | null
    polo_passivo: string | null
  } | null
  responsavel: { id: string; nome: string } | null
  encaminhada_por: { nome: string } | null
}

interface TarefasClientProps {
  usuarios: UsuarioRow[]
  usuarioAtivo: UsuarioRow
  tarefas: TarefaComJoins[]
  podeTrocarUsuario: boolean
  podeEditar: boolean
}

export default function TarefasClient({
  usuarios,
  usuarioAtivo,
  tarefas,
  podeTrocarUsuario,
  podeEditar,
}: TarefasClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const selectedId = searchParams.get('usuario_id') ?? usuarioAtivo.id

  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'prazo' | 'status'>('prazo')

  const visiveis = tarefas
    .filter((t) =>
      casaComBusca(busca, [
        t.processo?.numero_cnj,
        t.processo?.polo_ativo,
        t.processo?.polo_passivo,
        t.processo?.proxima_acao,
        statusLabel(t.processo?.status_atual ?? null),
        t.responsavel?.nome,
        t.observacoes,
      ])
    )
    .sort((a, b) => {
      // tarefa sem prazo interno entra pelo fatal, que é o que o cartão mostra
      if (ordem === 'prazo') {
        return (a.prazo_interno ?? a.prazo_fatal ?? '9999').localeCompare(b.prazo_interno ?? b.prazo_fatal ?? '9999')
      }
      // sem status vai para o fim
      const sa = a.processo?.status_atual
      const sb = b.processo?.status_atual
      if (!sa || !sb) return sa ? -1 : sb ? 1 : 0
      return statusLabel(sa).localeCompare(statusLabel(sb), 'pt-BR', { sensitivity: 'base' })
    })
  const abertas = visiveis.filter((t) => t.status_tarefa === 'aberta')
  const concluidas = visiveis.filter((t) => t.status_tarefa === 'concluida')

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.replace(`/tarefas?usuario_id=${e.target.value}`)
  }

  const usuariosParaSelect = usuarios.map((u) => ({ id: u.id, nome: u.nome }))

  return (
    <div className="space-y-8">
      {podeTrocarUsuario && (
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-xs text-text-tertiary">Visualizando como:</span>
          <select
            id="usuario-select"
            value={selectedId}
            onChange={handleChange}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent"
          >
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}{u.papel === 'gestor' ? ' (gestor)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número, parte, status ou observação"
          aria-label="Buscar tarefas"
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-accent sm:mr-2 sm:w-80"
        />
        <span className="text-xs text-text-tertiary">Ordenar por</span>
        {(['prazo', 'status'] as const).map((opcao) => (
          <button
            key={opcao}
            onClick={() => setOrdem(opcao)}
            className={`inline-flex items-center rounded-md border px-3 py-1.5 text-xs transition-colors ${
              ordem === opcao
                ? 'border-text-tertiary bg-surface text-text'
                : 'border-border bg-surface text-text-tertiary hover:text-text'
            }`}
          >
            {opcao === 'prazo' ? 'Prazo interno' : 'Status'}
          </button>
        ))}
        {busca.trim() && (
          <span className="text-xs text-text-tertiary">
            {visiveis.length} de {tarefas.length}
          </span>
        )}
      </div>

      {/* Tarefas abertas */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text">
          Tarefas abertas
          {abertas.length > 0 && (
            <span className="ml-2 text-text-tertiary font-normal">({abertas.length})</span>
          )}
        </h2>

        {abertas.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-8 text-center text-sm text-text-tertiary">
            {busca.trim() ? 'Nenhuma tarefa encontrada.' : 'Nenhuma tarefa aberta.'}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-b border-border-subtle bg-surface">
              <span className="w-2 shrink-0" />
              <span className="text-xs text-text-tertiary flex-1">Processo</span>
              <span className="text-xs text-text-tertiary w-40 text-right">Prazos</span>
              <span className="w-[21rem] shrink-0" />
            </div>
            <ul>
              {abertas.map((t) => (
                <li key={t.id}>
                  <TarefaCard
                    id={t.id}
                    processoId={t.processo?.id ?? null}
                    numeroCnj={t.processo?.numero_cnj ?? '—'}
                    statusProcesso={t.processo?.status_atual ?? null}
                    responsavelNome={t.responsavel?.nome ?? '—'}
                    responsavelId={t.responsavel?.id ?? ''}
                    prazoFatal={t.prazo_fatal}
                    prazoInterno={t.prazo_interno}
                    observacoes={t.observacoes}
                    proximaAcao={t.processo?.proxima_acao ?? null}
                    encaminhadaPor={t.encaminhada_por?.nome ?? null}
                    encaminhadaEm={t.encaminhada_em}
                    concluida={false}
                    usuarios={usuariosParaSelect}
                    podeEditar={podeEditar}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-text-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ok" /> Dentro do prazo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-warn" /> Prazo próximo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-danger" /> Urgente
          </span>
        </div>
      </div>

      {/* Tarefas concluídas */}
      {concluidas.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            Tarefas concluídas
            <span className="ml-2 text-text-tertiary font-normal">({concluidas.length})</span>
          </h2>
          <div className="rounded-lg border border-border overflow-hidden">
            <ul>
              {concluidas.map((t) => (
                <li key={t.id}>
                  <TarefaCard
                    id={t.id}
                    processoId={t.processo?.id ?? null}
                    numeroCnj={t.processo?.numero_cnj ?? '—'}
                    statusProcesso={t.processo?.status_atual ?? null}
                    responsavelNome={t.responsavel?.nome ?? '—'}
                    responsavelId={t.responsavel?.id ?? ''}
                    prazoFatal={t.prazo_fatal}
                    prazoInterno={t.prazo_interno}
                    observacoes={t.observacoes}
                    proximaAcao={t.processo?.proxima_acao ?? null}
                    encaminhadaPor={t.encaminhada_por?.nome ?? null}
                    encaminhadaEm={t.encaminhada_em}
                    concluida={true}
                    usuarios={usuariosParaSelect}
                    podeEditar={podeEditar}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
