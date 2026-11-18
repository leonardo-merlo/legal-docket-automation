'use client'

// Client component: o botão precisa de estado de carregando, de erro e de uma
// confirmação antes da ação destrutiva — nada disso existe em Server Component.

import { useState, useTransition } from 'react'
import { tratarNaMao, devolverAFila, tentarDeNovo } from './actions'

type Props = {
  processoId: string
  /** Já está fora da fila? Decide qual dos dois lados do toggle aparece. */
  tratadoNaMao: boolean
  /** DD/MM/AAAA da pauta cuja análise está na tela, quando o processo saiu de novo. */
  analiseAnterior?: string | null
  /** DD/MM/AAAA da pauta que trouxe o processo de volta para a fila. */
  pautaAtual?: string | null
  /** O rascunho da análise anterior já virou tarefa? */
  temTarefa?: boolean
  /** O robô parou de procurar este processo no RUPE: quantas rodadas e desde quando (DD/MM/AAAA). */
  roboDesistiu?: { falhas: number; desde: string } | null
}

export default function TratarNaMao({ processoId, tratadoNaMao, analiseAnterior, pautaAtual, temTarefa = false, roboDesistiu = null }: Props) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  function executar(acao: () => Promise<{ error?: string }>) {
    setErro(null)
    startTransition(async () => {
      const resultado = await acao()
      if (resultado.error) setErro(resultado.error)
      else setConfirmando(false)
    })
  }

  if (!tratadoNaMao && roboDesistiu) {
    return (
      <div className="rounded-lg border border-warn/40 bg-warn-subtle px-5 py-4">
        <p className="text-sm font-medium text-warn">
          O robô parou de procurar este processo em {roboDesistiu.desde}.
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Ele pesquisou o número no RUPE em {roboDesistiu.falhas} rodadas e não achou
          nenhuma vez. Às vezes a busca do RUPE falha mesmo com o processo lá, então
          confira no site do tribunal. Se o processo existir, mande o robô tentar de
          novo. Se não existir, ou se preferir resolver você, assuma ele na mão.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => executar(() => tentarDeNovo(processoId))}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Aguarde...' : 'Tentar de novo'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => executar(() => tratarNaMao(processoId))}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text disabled:opacity-50"
          >
            Tratar na mão
          </button>
        </div>
        {erro && <p className="mt-2 text-sm text-error">{erro}</p>}
      </div>
    )
  }

  if (!tratadoNaMao) {
    return (
      <div className="rounded-lg border border-border bg-surface px-5 py-4">
        {analiseAnterior ? (
          <p className="text-sm text-text-secondary">
            {/* Até 19/10/2026 dizia que a rodada "refaz os dois", e dava a entender
                que o rascunho antigo seria refeito. Desde 17/10 o robô só cria um
                rascunho novo; o antigo e a tarefa dele ficam como estão. */}
            Este processo saiu de novo na pauta{pautaAtual ? ` de ${pautaAtual}` : ''} e
            volta para a próxima rodada do robô. O rascunho abaixo é da pauta de{' '}
            {analiseAnterior} e continua como está
            {temTarefa ? ', assim como a tarefa criada a partir dele' : ''}. A rodada vai
            trazer os documentos novos e criar um rascunho separado para a
            publicação{pautaAtual ? ` de ${pautaAtual}` : ' nova'}. Você também pode
            assumir ele na mão: o robô para de tentar e o encaminhamento passa a ser
            preenchido por você.
          </p>
        ) : (
          <p className="text-sm text-text-secondary">
            A extração ainda não trouxe este processo. Você pode assumir ele na mão:
            o robô para de tentar e o encaminhamento passa a ser preenchido por você.
          </p>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => executar(() => tratarNaMao(processoId))}
          className="mt-3 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Tirando da fila...' : 'Tratar na mão'}
        </button>
        {erro && <p className="mt-2 text-sm text-error">{erro}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-subtle px-5 py-4">
      {!confirmando ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirmando(true)}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text disabled:opacity-50"
        >
          Devolver para a fila
        </button>
      ) : (
        <div className="rounded-md border border-warn/40 bg-warn-subtle px-3 py-2">
          <p className="text-sm text-warn">
            Devolver para a fila deixa a próxima extração sobrescrever o status, a
            próxima ação e o responsável que você preencheu. Continuar?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => executar(() => devolverAFila(processoId))}
              className="rounded-md bg-warn px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? 'Devolvendo...' : 'Sim, devolver'}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmando(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-2 text-sm text-error">{erro}</p>}
    </div>
  )
}
