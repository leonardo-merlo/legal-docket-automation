export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Tables } from '@/lib/supabase/types'
import { requireGestor } from '@/lib/auth/usuario-atual'
import { pjeStatusInfo } from '@/lib/status'
import LeituraDoEmail from './LeituraDoEmail'
import ConferenciaEmail from './ConferenciaEmail'
import AppHeader from '@/components/app-header'

type ProcessoResumo = Pick<
  Tables<'processos'>,
  'id' | 'numero_cnj' | 'sistema' | 'tipo' | 'pje_status' | 'status_atual'
> & {
  responsavel: { nome: string } | null
}

const SISTEMA_LABEL: Record<string, string> = {
  pje: 'PJE TJMG',
  eproc_tjmg: 'EPROC TJMG',
  eproc_trf6: 'EPROC TRF6',
}

const STATUS_LABEL: Record<string, string> = {
  CONTESTACAO: 'Contestação',
  SENTENCA_ACORDO: 'Sentença / Acordo',
  EXECUCAO: 'Execução',
  AGUARDAR: 'Aguardar',
  MANIFESTAR: 'Manifestar',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

export default async function EmailPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireGestor()
  const { id } = await params
  const supabase = createAdminClient()

  const [emailRes, processosRes] = await Promise.all([
    supabase.from('emails_recebidos').select('*, conferido_por:usuarios!emails_recebidos_conferido_por_id_fkey(nome)').eq('id', id).single(),
    supabase
      .from('processos')
      .select('id, numero_cnj, sistema, tipo, pje_status, status_atual, responsavel:usuarios(nome)')
      .eq('email_id', id)
      .order('data_criacao', { ascending: true }),
  ])

  if (emailRes.error || !emailRes.data) notFound()
  if (processosRes.error) throw new Error(`Erro ao buscar processos: ${processosRes.error.message}`)

  const email = emailRes.data
  const processos = (processosRes.data ?? []) as ProcessoResumo[]

  return (
    // a única página sem o cabeçalho do sistema até 19/10/2026: quem chegava
    // pela pauta não tinha como ir para Tarefas ou Configurações sem voltar
    <div className="min-h-screen bg-bg">
      <AppHeader active="dashboard" usuario={usuario} />
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">

        <nav className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/dashboard" className="hover:text-zinc-700">Dashboard</Link>
          <span>/</span>
          <span className="truncate text-zinc-700">{email.assunto ?? email.remetente}</span>
        </nav>

        <div>
          <h1 className="break-words text-xl font-semibold text-zinc-900">
            {email.assunto ?? email.remetente}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatDateTime(email.data_recebimento)} · {email.remetente}
          </p>
          <p className="mt-0.5 text-sm text-zinc-500">
            {email.total_cnj} processo{email.total_cnj !== 1 ? 's' : ''} extraído{email.total_cnj !== 1 ? 's' : ''}
            {email.data_processamento && ` · Processado em ${formatDateTime(email.data_processamento)}`}
          </p>
        </div>

        {/* no topo: é a primeira coisa que o Rafael faz ao abrir a pauta */}
        <ConferenciaEmail
          emailId={email.id}
          totalProcessos={email.total_cnj ?? 0}
          status={email.conferencia_status}
          processosErrados={email.conferencia_processos_errados}
          comentario={email.conferencia_comentario}
          conferidoPor={email.conferido_por?.nome ?? null}
          conferidoEm={email.conferido_em}
        />

        {email.gmail_message_id && <LeituraDoEmail email={email} />}

        <section>
          <h2 className="mb-4 text-base font-semibold text-zinc-900">Processos</h2>
          {processos.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-400">
              Nenhum processo vinculado a este e-mail.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {processos.map((p) => {
                const dot = pjeStatusInfo(p.pje_status)?.dot
                return (
                  <li key={p.id}>
                    <Link
                      href={`/processos/${p.id}`}
                      className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-zinc-900">{p.numero_cnj}</span>
                          {p.sistema && (
                            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                              {SISTEMA_LABEL[p.sistema] ?? p.sistema}
                            </span>
                          )}
                          {p.status_atual && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {STATUS_LABEL[p.status_atual] ?? p.status_atual}
                            </span>
                          )}
                        </div>
                        {p.responsavel && (
                          <p className="mt-1 text-xs text-zinc-500">Responsável: {p.responsavel.nome}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {dot && <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />}
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-zinc-400" aria-hidden="true">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

      </div>
    </div>
  )
}
