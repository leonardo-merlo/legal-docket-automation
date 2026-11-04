import Link from 'next/link'
import { alertaDoUltimoEmail, saudeDaSincronizacao, type NivelAlerta } from '@/lib/gmail/alertas'
import type { DadosPainelGmail } from '@/lib/gmail/painel'

// Versão de uma linha do cartão da pauta, para a tela de Revisão. O cartão
// inteiro mora em Configurações. Aqui fica só "Sincronizado há X", e a linha
// muda de cor quando algo pede atenção (desconectado, sem sincronizar, sem
// e-mail da OAB há dias), para o problema não sumir junto com o cartão.
const COR: Record<NivelAlerta, string> = {
  ok: 'text-text-tertiary',
  warn: 'text-warn',
  danger: 'text-danger',
}

const PONTO: Record<NivelAlerta, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

const PESO: Record<NivelAlerta, number> = { ok: 0, warn: 1, danger: 2 }

export default function StatusGmail({ dados }: { dados: DadosPainelGmail }) {
  const agora = new Date(dados.agora)
  const sincronizacao = saudeDaSincronizacao(dados.integracao, agora)
  const ultimoEmail = alertaDoUltimoEmail(dados.recentes[0]?.data_recebimento ?? null, agora)
  const nivel = PESO[ultimoEmail.nivel] > PESO[sincronizacao.nivel] ? ultimoEmail.nivel : sincronizacao.nivel
  const texto = ultimoEmail.nivel === 'ok' ? sincronizacao.texto : `${sincronizacao.texto} ${ultimoEmail.texto}`

  return (
    <Link
      href="/configuracoes"
      className={`inline-flex items-center gap-2 text-xs hover:underline ${COR[nivel]}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${PONTO[nivel]}`} aria-hidden="true" />
      Pauta da OAB: {texto}
    </Link>
  )
}
