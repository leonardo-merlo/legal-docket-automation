export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { Tables } from '@/lib/supabase/types'
import { requireGestor } from '@/lib/auth/usuario-atual'

type RascunhoRejeitado = Tables<'rascunhos'> & {
  processo: Pick<Tables<'processos'>, 'id' | 'numero_cnj' | 'polo_ativo'> | null
}

const STATUS_LABEL: Record<string, string> = {
  CONTESTACAO: 'Contestação',
  SENTENCA_ACORDO: 'Sentença / Acordo',
  EXECUCAO: 'Execução',
  AGUARDAR: 'Aguardar',
  MANIFESTAR: 'Manifestar',
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export default async function ProcessosRejeitadosPage() {
  await requireGestor()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('rascunhos')
    .select('*, processo:processos(id, numero_cnj, polo_ativo)')
    .eq('status', 'rejeitado')
    .order('data_revisao', { ascending: false })

  if (error) throw new Error(error.message)

  const rascunhos = (data ?? []) as RascunhoRejeitado[]

  return (
    <div className="min-h-screen bg-bg py-10 px-4">
      <div className="mx-auto max-w-4xl space-y-8">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text">Rascunhos rejeitados</h1>
            <p className="mt-0.5 text-sm text-text-tertiary">
              {rascunhos.length === 0
                ? 'Nenhum rascunho rejeitado.'
                : `${rascunhos.length} rascunho${rascunhos.length > 1 ? 's' : ''} rejeitado${rascunhos.length > 1 ? 's' : ''}.`}
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-text-tertiary underline-offset-2 hover:text-text hover:underline">
            Voltar ao dashboard
          </Link>
        </div>

        {rascunhos.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-text-tertiary">
            Nenhum rascunho rejeitado ainda.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rascunhos.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.processo?.id ? `/processos/${r.processo.id}` : '#'}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-5 py-4 shadow-sm transition-colors hover:border-border hover:bg-surface"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-text">
                        {r.processo?.numero_cnj ?? '—'}
                      </span>
                      {r.status_sugerido && (
                        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-text-secondary">
                          {STATUS_LABEL[r.status_sugerido] ?? r.status_sugerido}
                        </span>
                      )}
                    </div>
                    {r.processo?.polo_ativo && (
                      <p className="mt-1 truncate text-xs text-text-tertiary">{r.processo.polo_ativo}</p>
                    )}
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      Rejeitado em {formatDateTime(r.data_revisao)}
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  )
}
