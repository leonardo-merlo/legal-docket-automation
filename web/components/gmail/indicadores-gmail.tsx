import Link from 'next/link'
import { alertaDoUltimoEmail, alertasDoEmail, saudeDaSincronizacao, type NivelAlerta } from '@/lib/gmail/alertas'
import type { DadosPainelGmail } from '@/lib/gmail/painel'

const PONTO: Record<NivelAlerta, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

const FAIXA: Record<Exclude<NivelAlerta, 'ok'>, string> = {
  warn: 'bg-warn-subtle text-warn',
  danger: 'bg-danger-subtle text-danger',
}

function Indicador({ nivel, texto }: { nivel: NivelAlerta; texto: string }) {
  return (
    <li className="flex items-center gap-2 text-text-secondary">
      <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[nivel]}`} aria-hidden="true" />
      {texto}
    </li>
  )
}

export default function IndicadoresGmail({ dados, detalhado = false }: { dados: DadosPainelGmail; detalhado?: boolean }) {
  const agora = new Date(dados.agora)
  const conexao: { nivel: NivelAlerta; texto: string } = !dados.integracao
    ? { nivel: 'danger', texto: 'Nenhuma conta do Gmail conectada' }
    : dados.integracao.status === 'conectado'
      ? { nivel: 'ok', texto: `Conectado como ${dados.integracao.email_conectado}` }
      : { nivel: 'danger', texto: `Desconectado (era ${dados.integracao.email_conectado})` }
  const sincronizacao = saudeDaSincronizacao(dados.integracao, agora)
  const ultimoEmail = alertaDoUltimoEmail(dados.recentes[0]?.data_recebimento ?? null, agora)
  const alertas = dados.recentes.flatMap(alertasDoEmail)
  const { acerto } = dados

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-sm font-medium text-text">Pauta da OAB pelo Gmail</h2>
        <span className="rounded bg-border-subtle px-2 py-0.5 text-xs text-text-secondary">
          {dados.modo === 'sombra' ? 'Modo sombra: lê e registra, não mexe nos processos' : 'Modo ativo'}
        </span>
      </div>
      <ul className="space-y-1.5 text-sm">
        <Indicador nivel={conexao.nivel} texto={conexao.texto} />
        <Indicador nivel={sincronizacao.nivel} texto={sincronizacao.texto} />
        <Indicador nivel={ultimoEmail.nivel} texto={ultimoEmail.texto} />
      </ul>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border-subtle pt-3">
        <span className="text-xs uppercase tracking-wide text-text-tertiary">Processos puxados certo do e-mail</span>
        <span className="text-2xl font-semibold tabular-nums text-text">
          {acerto.percentual === null ? '—' : `${Math.round(acerto.percentual * 100)}%`}
        </span>
        <span className="text-xs text-text-tertiary">
          {acerto.emailsConferidos === 0
            ? 'nenhuma pauta conferida ainda'
            : `${acerto.certos} de ${acerto.total}, em ${acerto.emailsConferidos} pauta${acerto.emailsConferidos !== 1 ? 's' : ''} conferida${acerto.emailsConferidos !== 1 ? 's' : ''}`}
          {dados.pautasPorConferir > 0 && ` · ${dados.pautasPorConferir} por conferir`}
        </span>
      </div>
      {alertas.length > 0 && (
        <ul className="space-y-1">
          {alertas.map((alerta, indice) => (
            <li key={`${alerta.emailId}-${indice}`}>
              <Link href={`/emails/${alerta.emailId}`} className={`block rounded px-3 py-2 text-xs hover:underline ${FAIXA[alerta.nivel]}`}>
                {alerta.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!detalhado && (
        <Link href="/configuracoes" className="inline-block text-xs text-text-tertiary hover:text-text-secondary">
          Detalhes da integração
        </Link>
      )}
    </section>
  )
}
