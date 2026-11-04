import { sistemaEfetivo } from '@/lib/cnj'
import type { ResultadoParser } from '@/lib/gmail/parser'
import type { Tables } from '@/lib/supabase/types'

type EmailLido = Pick<
  Tables<'emails_recebidos'>,
  'lote_id' | 'total_blocos' | 'total_fint' | 'total_validos' | 'total_declarado' | 'total_declarado_assunto' | 'parser_status' | 'modo' | 'aplicacao_status' | 'erro' | 'parser_resultado'
>

const APLICACAO: Record<string, string> = {
  sombra: 'Modo sombra: lido e registrado, não gravado nos processos.',
  antes_do_corte: 'Pauta anterior à ativação: o Cowork já gravou.',
  pendente: 'Aguardando gravação nos processos.',
  aplicado: 'Gravado nos processos.',
  erro_aplicacao: 'Falhou ao gravar nos processos; a próxima sincronização tenta de novo.',
  remetente_nao_autenticado: 'Não gravado: o Gmail não confirmou que o e-mail veio mesmo do remetente.',
  pauta_repetida: 'Não gravado: esta pauta já tinha chegado em outro e-mail.',
}

export default function LeituraDoEmail({ email }: { email: EmailLido }) {
  const resultado = email.parser_resultado as unknown as ResultadoParser | null
  const numeros: [string, number | null][] = [
    ['Blocos', email.total_blocos],
    ['FINT descartados', email.total_fint],
    ['Válidos', email.total_validos],
    ['Declarado no corpo', email.total_declarado],
    ['Declarado no assunto', email.total_declarado_assunto],
  ]

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-900">Leitura do e-mail</h2>
      {email.aplicacao_status && <p className="text-sm text-zinc-600">{APLICACAO[email.aplicacao_status] ?? email.aplicacao_status}</p>}
      {email.erro && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{email.erro}</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
            <dt className="text-xs text-zinc-500">{rotulo}</dt>
            <dd className="text-lg font-semibold text-zinc-900">{valor ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {resultado && resultado.avisos.length > 0 && (
        <ul className="space-y-1 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {resultado.avisos.map((aviso, i) => <li key={`${i}-${aviso}`}>{aviso}</li>)}
        </ul>
      )}
      {resultado && resultado.processos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Publicação</th>
                <th className="px-3 py-2 font-medium">CNJ</th>
                <th className="px-3 py-2 font-medium">Sistema</th>
                <th className="px-3 py-2 font-medium">Vara</th>
                <th className="px-3 py-2 font-medium">Observação</th>
              </tr>
            </thead>
            <tbody>
              {resultado.processos.map((processo) => (
                <tr key={processo.numeroCnj} className="border-t border-zinc-100">
                  <td className="px-3 py-2">{processo.publicacoes.join(', ')}</td>
                  <td className="px-3 py-2 font-mono">{processo.numeroCnj}</td>
                  {/* sistemaEfetivo, e não nomeSistema: o parser grava o rótulo do Cowork ('pje', 'pje_2g'), que nomeSistema não traduz; é a mesma coluna da lista de entradas */}
                  <td className="px-3 py-2">{processo.sistema ? sistemaEfetivo(processo.numeroCnj, processo.sistema).nome : 'Revisar à mão'}</td>
                  <td className="px-3 py-2">{processo.vara ?? '—'}</td>
                  <td className="px-3 py-2">{processo.observacoes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
