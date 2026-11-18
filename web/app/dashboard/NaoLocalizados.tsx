import Link from 'next/link'
import type { NaoLocalizado } from '@/lib/nao-localizados'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}

// Cada um abre em aba nova: o gestor trata um, fecha a aba e volta para a lista
// sem perder o lugar.
export default function NaoLocalizados({ processos }: { processos: NaoLocalizado[] }) {
  if (processos.length === 0) return null

  return (
    <section className="rounded-lg border border-warn/40 bg-warn-subtle px-5 py-4">
      <h2 className="text-sm font-semibold text-warn">
        {processos.length === 1
          ? '1 processo que o robô não encontra no RUPE'
          : `${processos.length} processos que o robô não encontra no RUPE`}
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        O robô procura estes processos no RUPE e não acha. Quando ele para de
        procurar um deles, o processo fica marcado aqui e espera você. Abra cada um e confira
        no site do tribunal: se o processo existir, clique em &quot;Tentar de
        novo&quot;; se não existir, ou se preferir resolver você, clique em
        &quot;Tratar na mão&quot;.
      </p>
      <ul className="mt-3 divide-y divide-border-subtle rounded-md border border-border bg-surface">
        {processos.map((p) => (
          <li key={p.id}>
            <Link
              href={`/processos/${p.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-surface-raised"
            >
              <span className="font-mono text-xs text-text">{p.numero_cnj}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{p.vara ?? '—'}</span>
              {p.robo_desistiu_em ? (
                <span className="text-xs font-medium text-warn">
                  o robô parou de procurar em {formatDate(p.robo_desistiu_em)}
                </span>
              ) : (
                <span className="text-xs text-text-tertiary">
                  {p.tentativas > 0
                    ? `${p.tentativas} tentativa${p.tentativas !== 1 ? 's registradas' : ' registrada'} desde ${formatDate(p.desde)}`
                    : 'não encontrado na última extração'}
                </span>
              )}
              <span className="sr-only">(abre em nova aba)</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
