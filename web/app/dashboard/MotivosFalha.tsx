'use client'
// client component: cada categoria abre e fecha ao clique, o que exige estado.

// Clique, e não passar o mouse, de propósito. O objetivo declarado é o Rafael
// PEGAR esses números — e um painel que some quando o mouse se move não deixa
// selecionar e copiar nada. Clicando, a lista fica aberta o tempo que ele
// precisar, funciona no celular e é alcançável pelo teclado.

import { useState } from 'react'
import Link from 'next/link'
import { MotivoErro } from './erros'

const ERROS_VISIVEIS = 4

function formatData(iso: string | null): string {
  if (!iso) return 'sem data'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export default function MotivosFalha({ motivos }: { motivos: MotivoErro[] }) {
  const [aberta, setAberta] = useState<string | null>(null)

  const visiveis = motivos.slice(0, ERROS_VISIVEIS)
  const maior = visiveis[0]?.total ?? 0

  if (visiveis.length === 0) {
    return (
      <p className="mt-3 text-sm text-text-tertiary">
        Nenhum processo parado por falha. Aparece aqui quando algum não fechar.
      </p>
    )
  }

  return (
    <ul className="mt-3 space-y-2">
      {visiveis.map(({ categoria, total, exemplo, processos }) => {
        const estaAberta = aberta === categoria
        return (
          <li key={categoria}>
            <button
              type="button"
              onClick={() => setAberta(estaAberta ? null : categoria)}
              aria-expanded={estaAberta}
              className="grid w-full cursor-pointer grid-cols-[1fr_24px] items-start gap-2 rounded text-left hover:opacity-80"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs text-text-secondary" title={exemplo}>
                  {estaAberta ? '▾' : '▸'} {categoria}
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-border-subtle">
                  {/* Proporcional ao maior motivo, não ao total: com um motivo
                      dominante, escala sobre o total apagaria todos os outros. */}
                  <span
                    className="block h-1.5 rounded-full bg-danger/70"
                    style={{ width: `${maior === 0 ? 0 : Math.round((total / maior) * 100)}%` }}
                  />
                </span>
              </span>
              <span className="text-right text-xs tabular-nums text-text-tertiary">{total}</span>
            </button>

            {estaAberta && (
              <ul className="mt-1.5 space-y-1 rounded-md border border-border-subtle bg-bg px-2.5 py-2">
                {processos.map((p) => (
                  <li key={`${p.id}-${p.data}`} className="leading-tight">
                    <Link
                      href={`/processos/${p.id}`}
                      className="block font-mono text-[11px] text-text-secondary hover:underline"
                    >
                      {p.numeroCnj}
                    </Link>
                    <span className="text-[10px] text-text-tertiary">
                      {formatData(p.data)} · {p.sistema}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
