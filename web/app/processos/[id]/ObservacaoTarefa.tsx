'use client'
// Needs client for the editable textarea and save transition

import { useState, useTransition } from 'react'
import { salvarObservacaoTarefa } from '@/app/tarefas/actions'

export default function ObservacaoTarefa({
  tarefaId,
  observacoes,
  podeEditar,
}: {
  tarefaId: string
  observacoes: string | null
  podeEditar: boolean
}) {
  const [texto, setTexto] = useState(observacoes ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [isPending, startTransition] = useTransition()
  const mudou = texto.trim() !== (observacoes ?? '').trim()

  function salvar() {
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      try {
        const resultado = await salvarObservacaoTarefa(tarefaId, texto)
        if (resultado.error) {
          setErro(resultado.error)
          return
        }
        setSalvo(true)
      } catch {
        setErro('Erro ao salvar a observação. Tente novamente.')
      }
    })
  }

  return (
    <div>
      <label htmlFor="observacao-tarefa" className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        Observação
      </label>
      <textarea
        id="observacao-tarefa"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setSalvo(false) }}
        readOnly={!podeEditar}
        rows={3}
        placeholder={podeEditar ? 'Anote o que a equipe precisa saber sobre esta tarefa' : 'Sem observação.'}
        className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent resize-y"
      />
      {podeEditar && (
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={salvar}
            disabled={isPending || !mudou}
            className="flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-accent-fg transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? 'Salvando…' : 'Salvar observação'}
          </button>
          {salvo && !mudou && <span className="text-xs text-ok">Salvo.</span>}
          {erro && <span className="text-xs text-danger">{erro}</span>}
        </div>
      )}
    </div>
  )
}
