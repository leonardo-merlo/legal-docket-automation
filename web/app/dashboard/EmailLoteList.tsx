import Link from 'next/link'
import { Tables } from '@/lib/supabase/types'

type EmailLote = Pick<Tables<'emails_recebidos'>, 'id' | 'assunto' | 'remetente' | 'data_recebimento' | 'total_cnj'>

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export default function EmailLoteList({ lotes }: { lotes: EmailLote[] }) {
  if (lotes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-text-tertiary">
        Nenhum e-mail processado ainda.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <ul>
        {lotes.map((lote) => (
          <li key={lote.id}>
            <Link
              href={`/emails/${lote.id}`}
              className="flex items-center gap-4 px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-surface transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">
                  {lote.assunto ?? lote.remetente}
                </p>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {formatDateTime(lote.data_recebimento)}
                  {lote.assunto && (
                    <span className="ml-2">{lote.remetente}</span>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded bg-border-subtle px-2 py-0.5 text-xs text-text-secondary">
                  {lote.total_cnj ?? 0} CNJ{lote.total_cnj !== 1 ? 's' : ''}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-tertiary group-hover:text-text-secondary transition-colors" aria-hidden="true">
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
