import Link from 'next/link'
import { Tables } from '@/lib/supabase/types'
import { formatPrazoDate } from '@/lib/prazo'

type RascunhoPendente = Tables<'rascunhos'> & {
  processo: { id: string; numero_cnj: string; lote_id: string | null; data_entrada: string | null } | null
  responsavel: { nome: string }[] | null
}

const STATUS_LABEL: Record<string, string> = {
  CONTESTACAO: 'Contestação',
  SENTENCA_ACORDO: 'Sentença / Acordo',
  EXECUCAO: 'Execução',
  AGUARDAR: 'Aguardar',
  MANIFESTAR: 'Manifestar',
}

const STATUS_COLORS: Record<string, string> = {
  CONTESTACAO: 'bg-accent-subtle text-accent',
  SENTENCA_ACORDO: 'bg-warn-subtle text-warn',
  EXECUCAO: 'bg-ok-subtle text-ok',
  AGUARDAR: 'bg-border-subtle text-text-tertiary',
  MANIFESTAR: 'bg-accent-subtle text-accent',
}

const CENARIO_COLORS: Record<string, string> = {
  EXPLICITO:  'bg-border-subtle text-text-tertiary border border-border',
  VIA_ARTIGO: 'bg-border-subtle text-text-tertiary border border-border',
  INFERIDO:   'bg-warn-subtle text-warn border border-warn/25',
}

const CENARIO_LABEL: Record<string, string> = {
  EXPLICITO:  'Prazo explícito',
  VIA_ARTIGO: 'Prazo via artigo',
  INFERIDO:   'Prazo inferido',
}

export default function RascunhoCard({ rascunho }: { rascunho: RascunhoPendente }) {
  const processoId = rascunho.processo?.id
  const dataPublicacao = rascunho.processo?.lote_id ?? rascunho.processo?.data_entrada
  const statusStyle = STATUS_COLORS[rascunho.status_sugerido ?? ''] ?? 'bg-border-subtle text-text-secondary'

  return (
    <Link
      href={processoId ? `/processos/${processoId}` : '#'}
      className="grid grid-cols-[1fr] sm:grid-cols-[1fr_140px_120px_100px_32px] gap-3 items-center px-4 py-3.5 border-b border-border-subtle last:border-0 hover:bg-surface transition-colors group"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-text-secondary">
            {rascunho.processo?.numero_cnj ?? '—'}
          </span>
          {rascunho.cenario_prazo && (
            <span className={`rounded px-1.5 py-0.5 text-xs font-mono ${CENARIO_COLORS[rascunho.cenario_prazo] ?? 'bg-border-subtle text-text-tertiary'}`}>
              {CENARIO_LABEL[rascunho.cenario_prazo] ?? rascunho.cenario_prazo}
            </span>
          )}
        </div>
        {rascunho.proxima_acao && (
          <p className="mt-0.5 text-xs text-text-secondary truncate">{rascunho.proxima_acao}</p>
        )}
        {!rascunho.proxima_acao && rascunho.alerta && (
          <p className="mt-0.5 text-xs text-warn truncate">{rascunho.alerta}</p>
        )}
      </div>

      <span className={`hidden sm:inline-flex items-center rounded px-2 py-0.5 text-xs font-medium w-fit ${statusStyle}`}>
        {STATUS_LABEL[rascunho.status_sugerido ?? ''] ?? rascunho.status_sugerido ?? '—'}
      </span>

      <span className="hidden sm:block text-sm text-text-secondary">
        {rascunho.responsavel?.[0]?.nome ?? rascunho.responsavel_sugerido ?? '—'}
      </span>

      <span className="hidden sm:block text-sm text-text text-right tabular-nums">
        {formatPrazoDate(dataPublicacao, rascunho.prazo_fatal_dias_uteis)}
      </span>

      <span className="hidden sm:flex justify-end text-text-tertiary group-hover:text-text-secondary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </span>
    </Link>
  )
}
