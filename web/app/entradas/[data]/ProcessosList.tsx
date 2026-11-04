'use client'
// Needs client for sort state

import { useState } from 'react'
import Link from 'next/link'
import { Tables } from '@/lib/supabase/types'
import { CENARIO_PRAZO_CURTO, RISCO_STYLE, pjeStatusInfo, riscoLabel, riscoPeso, statusLabel } from '@/lib/status'
import { sistemaEfetivo } from '@/lib/cnj'
import { casaComBusca } from '@/lib/busca'
import { numerosDaPublicacao, observacoesSemDuplicado } from '@/lib/publicacao'

type ProcessoItem = Pick<
  Tables<'processos'>,
  'id' | 'numero_cnj' | 'numero_publicacao' | 'polo_ativo' | 'polo_passivo' | 'vara' | 'comarca' | 'classe_processual' | 'pje_status' | 'duplicata' | 'observacoes' | 'sistema' | 'motivo_ignorado'
>

/** O que a análise da IA disse sobre o processo, resumido para caber na linha. */
export type AnaliseResumo = {
  /** Situação do rascunho mais recente: pendente, aprovado ou rejeitado. */
  aprovacao: string | null
  statusSugerido: string | null
  classificacaoRisco: string | null
  cenarioPrazo: string | null
  /** Já formatado como data, ou '—'. */
  prazoFatal: string
  prazoFatalDias: number | null
}

// Esta coluna mostrava `processos.sistema` cru, que é o PALPITE da skill do
// Gmail lendo o texto da Vara — não o sistema em que o processo foi procurado.
// Quando o palpite aponta para outro tribunal, o roteador o recusa, e a tela
// passava a se contradizer: 1193807-82.2020.4.01.3821 (TRF1) foi rotulado
// 'pje_2g' e aparecia como "RUPE 2ª inst." com "Sistema não implementado" logo
// abaixo. Agora a coluna mostra o que o roteador realmente decide.

// A maioria dos motivos já vem escrita em português pelo extrator; estes poucos
// ficaram como código interno e precisam de tradução.
const MOTIVO_LABEL: Record<string, string> = {
  sem_documentos: 'Nenhum documento encontrado no processo',
}

const MOTIVO_CLASSE: Record<string, string> = {
  erro_browser:      'text-red-700',
  captcha_bloqueado: 'text-red-700',
  pendente:          'text-amber-700',
}

// Dez colunas. As larguras fixas foram medidas pelo conteúdo mais largo de
// cada uma — "Aguardando aprovação" e "Erro browser" são os selos que definem o
// tamanho —, e o processo fica em minmax para o CNJ nunca ser cortado: faltando
// espaço a tabela rola na horizontal em vez de comer o número.
//
// As duas variantes estão escritas por extenso, e não montadas com template
// string, porque o Tailwind gera CSS lendo o código-fonte: uma classe montada
// em tempo de execução simplesmente não existe na folha de estilo.
const GRID_CABECALHO = 'grid-cols-[64px_minmax(220px,1fr)_130px_110px_120px_84px_92px_96px_116px_92px]'
const GRID_LINHA = 'sm:grid-cols-[64px_minmax(220px,1fr)_130px_110px_120px_84px_92px_96px_116px_92px]'

// Processo concluído pode ter ficado com o motivo de uma falha anterior gravado —
// mostrá-lo faria um processo correto parecer com problema.
// 'ignorado' serve para duas coisas diferentes: duplicata e CNJ que o roteador não
// soube classificar. O selo dizia "Duplicata" para os dois — e em 06/08/2026 os três
// processos nesse status eram todos "sistema não implementado", com duplicata=false.
function rotuloIgnorado(p: ProcessoItem): string {
  return p.duplicata ? 'Duplicata' : 'Sem sistema'
}

function motivoVisivel(p: ProcessoItem): string | null {
  if (!p.motivo_ignorado || p.pje_status === 'processado') return null
  return MOTIVO_LABEL[p.motivo_ignorado] ?? p.motivo_ignorado
}

const APROVACAO: Record<string, { label: string; className: string }> = {
  pendente: { label: 'Aguardando aprovação', className: 'bg-amber-100 text-amber-800' },
  aprovado: { label: 'Aprovado', className: 'bg-ok-subtle text-ok' },
  rejeitado: { label: 'Rejeitado', className: 'bg-danger-subtle text-danger' },
}

type Ordenacao = 'publicacao' | 'criticidade' | 'status'

function camposDeBusca(p: ProcessoItem, analise: AnaliseResumo | undefined): (string | null | undefined)[] {
  const situacao = p.pje_status === 'ignorado' ? rotuloIgnorado(p) : pjeStatusInfo(p.pje_status)?.label
  return [
    p.numero_cnj, p.polo_ativo, p.polo_passivo, p.classe_processual, p.vara, p.comarca,
    analise?.statusSugerido ? statusLabel(analise.statusSugerido) : null,
    APROVACAO[analise?.aprovacao ?? '']?.label,
    situacao,
  ]
}

export default function ProcessosList({
  processos,
  analises,
  avisos,
}: {
  processos: ProcessoItem[]
  analises: Map<string, AnaliseResumo>
  /** Processo que saiu em mais de uma pauta: de qual análise esta linha depende. */
  avisos: Map<string, string>
}) {
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('publicacao')
  const [busca, setBusca] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function compararPublicacao(a: ProcessoItem, b: ProcessoItem): number {
    const va = a.numero_publicacao ?? ''
    const vb = b.numero_publicacao ?? ''
    return va.localeCompare(vb, 'pt-BR', { numeric: true, sensitivity: 'base' })
  }

  const buscando = busca.trim().length > 0
  const filtrados = processos.filter((p) => casaComBusca(busca, camposDeBusca(p, analises.get(p.id))))

  const sorted = [...filtrados].sort((a, b) => {
    if (ordenacao === 'publicacao') {
      const cmp = compararPublicacao(a, b)
      return sortDir === 'asc' ? cmp : -cmp
    }

    if (ordenacao === 'status') {
      // Sem status vai para o fim; empate cai na ordem de publicação.
      const sa = statusLabel(analises.get(a.id)?.statusSugerido ?? null)
      const sb = statusLabel(analises.get(b.id)?.statusSugerido ?? null)
      const semA = !analises.get(a.id)?.statusSugerido
      const semB = !analises.get(b.id)?.statusSugerido
      if (semA !== semB) return semA ? 1 : -1
      const cmp = sa.localeCompare(sb, 'pt-BR', { sensitivity: 'base' })
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp
      return compararPublicacao(a, b)
    }

    // Criticidade só faz sentido numa direção: do mais crítico para baixo.
    // Empate de risco vai pelo prazo mais próximo — entre dois processos ALTO,
    // o que vence em 3 dias é o que precisa ser visto primeiro. Sem prazo fica
    // atrás dos que têm; sem nada, cai na ordem de publicação, que é estável.
    const analiseA = analises.get(a.id)
    const analiseB = analises.get(b.id)

    const risco = riscoPeso(analiseA?.classificacaoRisco) - riscoPeso(analiseB?.classificacaoRisco)
    if (risco !== 0) return risco

    const prazoA = analiseA?.prazoFatalDias ?? Number.MAX_SAFE_INTEGER
    const prazoB = analiseB?.prazoFatalDias ?? Number.MAX_SAFE_INTEGER
    if (prazoA !== prazoB) return prazoA - prazoB

    return compararPublicacao(a, b)
  })

  function alternarOrdenacao(nova: 'publicacao' | 'status') {
    if (ordenacao === nova) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setOrdenacao(nova)
    setSortDir('asc')
  }

  const botaoBase =
    'inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors'
  const botaoAtivo = 'border-text-tertiary bg-surface text-text'
  const botaoInativo = 'border-border bg-surface text-text-tertiary hover:text-text'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por número, parte, vara, status ou aprovação"
          aria-label="Buscar processos"
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-accent sm:mr-2 sm:w-80"
        />
        <span className="text-xs text-text-tertiary">Ordenar por</span>
        <button
          onClick={() => alternarOrdenacao('publicacao')}
          className={`${botaoBase} ${ordenacao === 'publicacao' ? botaoAtivo : botaoInativo}`}
        >
          Nº publicação {ordenacao === 'publicacao' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          onClick={() => setOrdenacao('criticidade')}
          className={`${botaoBase} ${ordenacao === 'criticidade' ? botaoAtivo : botaoInativo}`}
        >
          Criticidade {ordenacao === 'criticidade' ? '↓' : ''}
        </button>
        <button
          onClick={() => alternarOrdenacao('status')}
          className={`${botaoBase} ${ordenacao === 'status' ? botaoAtivo : botaoInativo}`}
        >
          Status sugerido {ordenacao === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </button>
        {buscando && (
          <span className="text-xs text-text-tertiary">
            {filtrados.length} de {processos.length}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <div className={`hidden sm:grid ${GRID_CABECALHO} gap-2 px-4 py-2 border-b border-border-subtle bg-surface`}>
            <span className="text-xs text-text-tertiary text-center">Nº</span>
            <span className="text-xs text-text-tertiary">Processo</span>
            <span className="text-xs text-text-tertiary">Polo ativo</span>
            <span className="text-xs text-text-tertiary">Observações</span>
            <span className="text-xs text-text-tertiary">Status sugerido</span>
            <span className="text-xs text-text-tertiary">Criticidade</span>
            <span className="text-xs text-text-tertiary">Prazo fatal</span>
            <span className="text-xs text-text-tertiary">Sistema</span>
            <span className="text-xs text-text-tertiary">Aprovação</span>
            <span className="text-xs text-text-tertiary text-right">Status</span>
          </div>
          <ul>
            {sorted.map((p) => {
              const statusBase = pjeStatusInfo(p.pje_status)
              const statusInfo = statusBase && p.pje_status === 'ignorado'
                ? { ...statusBase, label: rotuloIgnorado(p) }
                : statusBase
              const motivo = motivoVisivel(p)
              const analise = analises.get(p.id)
              const aprovacao = APROVACAO[analise?.aprovacao ?? '']
              return (
                <li key={p.id}>
                  <Link
                    href={p.duplicata ? '#' : `/processos/${p.id}`}
                    className={`grid grid-cols-[1fr] ${GRID_LINHA} gap-2 items-center px-4 py-3.5 border-b border-border-subtle last:border-0 transition-colors ${p.duplicata ? 'opacity-50 cursor-default' : 'hover:bg-surface'}`}
                  >
                    <span className="hidden sm:block text-xs text-text-tertiary text-center tabular-nums font-mono">
                      {numerosDaPublicacao(p.numero_publicacao, p.observacoes) ?? '—'}
                    </span>
                    <div className="min-w-0">
                      <span className="font-mono text-xs text-text-secondary whitespace-nowrap">{p.numero_cnj}</span>
                      {p.classe_processual && (
                        <p className="text-xs text-text-tertiary mt-0.5 truncate">{p.classe_processual}</p>
                      )}
                    </div>

                    <span className="hidden sm:block text-xs text-text-secondary truncate">
                      {p.polo_ativo ?? '—'}
                    </span>

                    <div className="hidden sm:block min-w-0">
                      {observacoesSemDuplicado(p.observacoes) && (
                        <span className="text-xs text-text-tertiary truncate block" title={observacoesSemDuplicado(p.observacoes) ?? undefined}>
                          {observacoesSemDuplicado(p.observacoes)}
                        </span>
                      )}
                    </div>

                    <div className="hidden sm:block min-w-0">
                      {analise?.statusSugerido ? (
                        <span
                          title={statusLabel(analise.statusSugerido)}
                          className="text-xs text-text-secondary truncate block"
                        >
                          {statusLabel(analise.statusSugerido)}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                    </div>

                    {/* Sem análise a célula fica com traço, e não vazia: vazio
                        não distingue "não analisado" de "sem risco". */}
                    <div className="hidden sm:flex items-center">
                      {analise?.classificacaoRisco ? (
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${RISCO_STYLE[analise.classificacaoRisco] ?? 'bg-zinc-100 text-zinc-700'}`}>
                          {riscoLabel(analise.classificacaoRisco)}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                    </div>

                    <div className="hidden sm:block min-w-0">
                      <span className="text-xs text-text-secondary tabular-nums block">
                        {analise?.prazoFatal ?? '—'}
                      </span>
                      {analise?.cenarioPrazo && (
                        <span
                          title={`Como o prazo foi determinado: ${CENARIO_PRAZO_CURTO[analise.cenarioPrazo] ?? analise.cenarioPrazo}`}
                          className={`text-xs block truncate ${analise.cenarioPrazo === 'INFERIDO' ? 'text-warn' : 'text-text-tertiary'}`}
                        >
                          {CENARIO_PRAZO_CURTO[analise.cenarioPrazo] ?? analise.cenarioPrazo}
                        </span>
                      )}
                    </div>

                    <div className="hidden sm:block min-w-0">
                      <span className="text-xs text-text-secondary truncate block">
                        {sistemaEfetivo(p.numero_cnj, p.sistema).nome}
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center">
                      {aprovacao ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium leading-tight ${aprovacao.className}`}>
                          {aprovacao.label}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                    </div>

                    <div className="hidden sm:flex justify-end">
                      {statusInfo ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">{p.pje_status ?? '—'}</span>
                      )}
                    </div>

                    {motivo && (
                      // alinhado à direita de propósito: a mensagem nasce embaixo da
                      // coluna Status, que é o selo a que ela se refere.
                      <p
                        title={motivo}
                        className={`sm:col-span-10 text-xs leading-snug sm:text-right ${MOTIVO_CLASSE[p.pje_status ?? ''] ?? 'text-text-tertiary'}`}
                      >
                        {motivo}
                      </p>
                    )}
                    {avisos.get(p.id) && (
                      <p className="sm:col-span-10 text-xs leading-snug sm:text-right text-text-tertiary">
                        {avisos.get(p.id)}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
