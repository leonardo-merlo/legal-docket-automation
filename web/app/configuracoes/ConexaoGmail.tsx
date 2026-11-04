import IndicadoresGmail from '@/components/gmail/indicadores-gmail'
import type { DadosPainelGmail } from '@/lib/gmail/painel'
import EmailLoteList from '@/app/dashboard/EmailLoteList'
import SincronizarGmailButton from './SincronizarGmailButton'

const RETORNO_DO_GOOGLE: Record<string, { classe: string; texto: string }> = {
  conectado: { classe: 'bg-ok-subtle text-ok', texto: 'Gmail conectado.' },
  recusado: { classe: 'bg-warn-subtle text-warn', texto: 'A conexão foi cancelada na tela do Google.' },
  conta_errada: { classe: 'bg-danger-subtle text-danger', texto: 'Essa não é a conta que recebe a pauta da OAB. Conecte com gestor@exemplo-adv.example.' },
  sem_permissao: { classe: 'bg-danger-subtle text-danger', texto: 'A caixa de leitura do Gmail não foi marcada na tela do Google. Conecte de novo e marque a permissão.' },
  state_invalido: { classe: 'bg-danger-subtle text-danger', texto: 'A conexão expirou ou veio de outra aba. Tente de novo.' },
  nao_autorizado: { classe: 'bg-danger-subtle text-danger', texto: 'Só o gestor pode conectar o Gmail.' },
  erro: { classe: 'bg-danger-subtle text-danger', texto: 'Não foi possível conectar. Tente de novo; se repetir, avise o Leonardo.' },
}

export default function ConexaoGmail({ dados, retorno }: { dados: DadosPainelGmail; retorno?: string }) {
  const aviso = retorno ? RETORNO_DO_GOOGLE[retorno] : undefined
  const conectado = dados.integracao?.status === 'conectado'

  return (
    <section className="space-y-3">
      {aviso && <p className={`rounded px-3 py-2 text-sm ${aviso.classe}`}>{aviso.texto}</p>}
      <IndicadoresGmail dados={dados} detalhado />
      <div className="flex flex-wrap items-center gap-3">
        {/* <a> e não <Link>: é uma rota que redireciona ao Google, e o prefetch do Link a chamaria sozinho */}
        <a href="/api/gmail/conectar" className="rounded bg-accent px-3 py-1.5 text-xs text-accent-fg hover:opacity-90">
          {dados.integracao ? 'Reconectar Gmail' : 'Conectar Gmail'}
        </a>
        {conectado && <SincronizarGmailButton />}
      </div>
      {dados.recentes.length > 0 && <EmailLoteList lotes={dados.recentes} />}
    </section>
  )
}
