'use client'
// Needs client for month filter dropdown state and CNJ search

import { useState, useTransition, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import BotaoIniciar from '@/components/botao-iniciar'
import { buscarProcessoPorCnj, type ResultadoBuscaCnj } from './actions'
import MetricasResumo from './MetricasResumo'
import QualidadeAnalise from './QualidadeAnalise'
import { calcularQualidade, type RevisaoLinha } from './qualidade'
import { calcularMotivosErro, type LinhaMotivo } from './erros'
import {
  calcularMetricas,
  ehErro,
  type EntradaPublicacao,
} from './metricas'

interface DiaAgrupado {
  data: string // YYYY-MM-DD
  total: number
  extraidos: number
  agAprovacao: number
  erros: number
  pendentes: number
  /** Sem coluna até 17/10: o dia 30/09 mostrava 34 no total e zero em todas as colunas. */
  naMao: number
  ignorados: number
}

function agruparPorDia(entradas: EntradaPublicacao[], aguardandoPorPublicacao: Map<string, number>): DiaAgrupado[] {
  const mapa = new Map<string, DiaAgrupado>()

  for (const e of entradas) {
    const data = e.pauta
    if (!mapa.has(data)) {
      mapa.set(data, {
        data, total: 0, extraidos: 0, agAprovacao: 0, erros: 0, pendentes: 0, naMao: 0, ignorados: 0,
      })
    }
    const dia = mapa.get(data)!
    dia.total++
    if (e.statusEfetivo === 'processado') {
      dia.extraidos++
      dia.agAprovacao += aguardandoPorPublicacao.get(e.id) ?? 0
    } else if (ehErro(e.statusEfetivo)) {
      dia.erros++
    } else if (e.statusEfetivo === 'pendente') {
      dia.pendentes++
    } else if (e.statusEfetivo === 'tratado_manual') {
      dia.naMao++
    } else if (e.statusEfetivo === 'ignorado') {
      // sem esta contagem o 'ignorado' entrava no total e em coluna nenhuma:
      // as parcelas não fechavam com o total e ninguém percebia
      dia.ignorados++
    }
  }

  return Array.from(mapa.values()).sort((a, b) => b.data.localeCompare(a.data))
}

function formatData(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function labelMes(anoMes: string): string {
  const [ano, mes] = anoMes.split('-')
  return `${MESES[parseInt(mes, 10) - 1]} ${ano}`
}

function resolverDataPublicacao(r: ResultadoBuscaCnj): string | null {
  if (r.lote_id) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.lote_id)) return r.lote_id
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(r.lote_id)) {
      const [d, m, y] = r.lote_id.split('/')
      return `${y}-${m}-${d}`
    }
  }
  if (r.data_entrada) return r.data_entrada.split('T')[0]
  return null
}

export default function EntradasPorDia({
  entradas,
  aguardandoPorPublicacao,
  custoPorPublicacao,
  rascunhoParaPublicacao,
  tarefasCount,
  revisoes,
  linhasMotivo,
}: {
  entradas: EntradaPublicacao[]
  aguardandoPorPublicacao: Map<string, number>
  custoPorPublicacao: Map<string, number>
  /** rascunho → publicação, para levar uma revisão até o mês da pauta. */
  rascunhoParaPublicacao: Map<string, string>
  tarefasCount: number
  revisoes: RevisaoLinha[]
  linhasMotivo: LinhaMotivo[]
}) {
  const dias = agruparPorDia(entradas, aguardandoPorPublicacao)

  const mesesDisponiveis = Array.from(
    new Set(dias.map((d) => d.data.slice(0, 7)))
  ).sort((a, b) => b.localeCompare(a))

  const router = useRouter()
  const [mesSelecionado, setMesSelecionado] = useState<string>('todos')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFim, setPeriodoFim] = useState('')
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ResultadoBuscaCnj[] | null>(null)
  const [buscaErro, setBuscaErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Datas em YYYY-MM-DD comparam certo como texto. No período personalizado,
  // ponta vazia é ponta aberta: só "de" já filtra dali em diante.
  const periodoInvertido = mesSelecionado === 'periodo'
    && periodoInicio !== '' && periodoFim !== '' && periodoInicio > periodoFim
  function dentroDoFiltro(data: string | null): boolean {
    if (mesSelecionado === 'todos') return true
    if (!data) return false
    if (mesSelecionado === 'periodo') {
      if (periodoInvertido) return false
      if (periodoInicio && data < periodoInicio) return false
      if (periodoFim && data > periodoFim) return false
      return true
    }
    return data.startsWith(mesSelecionado)
  }

  const diasFiltrados = dias.filter((d) => dentroDoFiltro(d.data))

  const totalFiltrado = diasFiltrados.reduce((soma, d) => soma + d.total, 0)

  // as métricas seguem o mesmo filtro da tabela: dois números na mesma tela
  // contando períodos diferentes se contradizem sem avisar
  const entradasFiltradas = entradas.filter((e) => dentroDoFiltro(e.pauta))

  const metricas = calcularMetricas(entradasFiltradas, aguardandoPorPublicacao, custoPorPublicacao)

  // Os três cartões de baixo seguem o mesmo filtro dos números de cima. Sem isto
  // a taxa contava o mês escolhido e os cartões contavam o histórico inteiro —
  // dois períodos lado a lado, sem nada dizendo que eram diferentes.
  const dataDaPublicacao = new Map(entradas.map((e) => [e.id, e.pauta]))

  const motivosFiltrados = linhasMotivo.filter((l) => dentroDoFiltro(l.pauta))

  // A revisão só conhece o rascunho; a data vem da publicação que ele analisou. Revisão órfã
  // (rascunho apagado) fica de fora do período escolhido: não dá para afirmar a
  // que pauta ela pertence, e chutar num cartão de qualidade seria pior que omitir.
  const revisoesFiltradas = mesSelecionado === 'todos'
    ? revisoes
    : revisoes.filter((r) => {
        const publicacaoId = rascunhoParaPublicacao.get(r.rascunho_id)
        return publicacaoId ? dentroDoFiltro(dataDaPublicacao.get(publicacaoId) ?? null) : false
      })

  const qualidade = (
    <QualidadeAnalise
      qualidade={calcularQualidade(revisoesFiltradas)}
      motivosErro={calcularMotivosErro(motivosFiltrados)}
    />
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (busca.replace(/\D/g, '').length < 4) return
    debounceRef.current = setTimeout(() => {
      setBuscaErro(null)
      startTransition(async () => {
        try {
          const res = await buscarProcessoPorCnj(busca)
          setResultados(res)
        } catch {
          setBuscaErro('Erro ao buscar. Tente novamente.')
        }
      })
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca])

  function handleBuscaChange(valor: string) {
    setBusca(valor)
    if (valor.replace(/\D/g, '').length < 4) {
      setResultados(null)
      setBuscaErro(null)
    }
  }

  function handleLimpar() {
    setBusca('')
    setResultados(null)
    setBuscaErro(null)
  }

  const cabecalho = (
    <div className="flex items-end justify-between">
      <div>
        <h1 className="text-xl font-semibold text-text">Publicações por data</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {totalFiltrado} CNJ{totalFiltrado !== 1 ? 's' : ''} registrado{totalFiltrado !== 1 ? 's' : ''}
          {tarefasCount > 0 && (
            <span className="ml-3 text-text-tertiary">
              · {tarefasCount} tarefa{tarefasCount > 1 ? 's' : ''} aberta{tarefasCount > 1 ? 's' : ''} no painel
            </span>
          )}
        </p>
      </div>
      <BotaoIniciar />
    </div>
  )

  if (dias.length === 0) {
    // banco vazio — é a tela de estreia depois de um reset. Os cartões aparecem
    // zerados, com a frase: sumir daria a impressão de sistema quebrado.
    return (
      <div className="space-y-10">
        {cabecalho}
        <MetricasResumo metricas={metricas} />
      {qualidade}
        <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-text-tertiary">
          Nenhuma publicação registrada ainda.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {cabecalho}
      <MetricasResumo metricas={metricas} />
      {qualidade}
      <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="filtro-mes" className="text-xs text-text-tertiary whitespace-nowrap">Filtrar por mês</label>
          <select
            id="filtro-mes"
            value={mesSelecionado}
            onChange={(e) => { setMesSelecionado(e.target.value); handleLimpar() }}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="todos">Todos</option>
            {mesesDisponiveis.map((m) => (
              <option key={m} value={m}>{labelMes(m)}</option>
            ))}
            <option value="periodo">Período personalizado…</option>
          </select>
        </div>

        {mesSelecionado === 'periodo' && (
          <div className="flex items-center gap-2">
            <label htmlFor="periodo-inicio" className="text-xs text-text-tertiary">De</label>
            <input
              id="periodo-inicio"
              type="date"
              value={periodoInicio}
              max={periodoFim || undefined}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <label htmlFor="periodo-fim" className="text-xs text-text-tertiary">até</label>
            <input
              id="periodo-fim"
              type="date"
              value={periodoFim}
              min={periodoInicio || undefined}
              onChange={(e) => setPeriodoFim(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
          <input
            type="text"
            placeholder="Buscar CNJ…"
            value={busca}
            onChange={(e) => handleBuscaChange(e.target.value)}
            className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          {isPending && (
            <span className="text-xs text-text-tertiary">…</span>
          )}
          {busca.length > 0 && !isPending && (
            <button
              onClick={handleLimpar}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-tertiary hover:text-text transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {periodoInvertido && (
        <p className="text-xs text-danger">A data inicial está depois da final.</p>
      )}

      {buscaErro && (
        <p className="text-xs text-danger">{buscaErro}</p>
      )}

      {resultados !== null && (
        <div className="rounded-lg border border-border overflow-hidden">
          {resultados.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-tertiary text-center">Nenhum processo encontrado para esse CNJ.</p>
          ) : (
            <>
              <div className="hidden sm:grid grid-cols-[1fr_180px_100px] gap-3 px-4 py-2 border-b border-border-subtle bg-surface">
                <span className="text-xs text-text-tertiary">Processo</span>
                <span className="text-xs text-text-tertiary">Polo ativo</span>
                <span className="text-xs text-text-tertiary">Data de publicação</span>
              </div>
              <ul>
                {resultados.map((r) => {
                  const dataIso = resolverDataPublicacao(r)
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/processos/${r.id}`}
                        className="grid grid-cols-[1fr] sm:grid-cols-[1fr_180px_100px] gap-3 items-center px-4 py-3.5 border-b border-border-subtle last:border-0 hover:bg-surface transition-colors"
                      >
                        <span className="font-mono text-xs text-text-secondary">{r.numero_cnj}</span>
                        <span className="hidden sm:block text-xs text-text-secondary truncate">{r.polo_ativo ?? '—'}</span>
                        <span className="hidden sm:block text-xs text-text-secondary">
                          {dataIso ? (
                            // <a> aninhado dentro de <a> é HTML inválido (quebra hidratação);
                            // navegação manual via router mantém o atalho para o dia
                            <span
                              role="link"
                              tabIndex={0}
                              className="cursor-pointer hover:underline"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                router.push(`/entradas/${dataIso}`)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  router.push(`/entradas/${dataIso}`)
                                }
                              }}
                            >
                              {formatData(dataIso)}
                            </span>
                          ) : '—'}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {resultados === null && (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1fr_70px_70px_110px_70px_70px_70px_80px] gap-3 px-4 py-2 border-b border-border-subtle bg-surface">
          <span className="text-xs text-text-tertiary">Data de publicação</span>
          <span className="text-xs text-text-tertiary text-right">Total</span>
          <span className="text-xs text-text-tertiary text-right">Extraídos</span>
          <span className="text-xs text-text-tertiary text-right">Ag. aprovação</span>
          <span className="text-xs text-text-tertiary text-right">Erros</span>
          <span className="text-xs text-text-tertiary text-right">Pendentes</span>
          <span className="text-xs text-text-tertiary text-right">Na mão</span>
          <span className="text-xs text-text-tertiary text-right">Ignorados</span>
        </div>
        <ul>
          {diasFiltrados.map((dia) => (
            <li
              key={dia.data}
              className="grid grid-cols-[1fr] sm:grid-cols-[1fr_70px_70px_110px_70px_70px_70px_80px] gap-3 items-center px-4 py-3 border-b border-border-subtle last:border-0 hover:bg-surface transition-colors"
            >
              <Link href={`/entradas/${dia.data}`} className="text-sm text-text font-medium hover:underline">
                {formatData(dia.data)}
              </Link>
              <span className="hidden sm:block text-sm text-text-secondary text-right tabular-nums">{dia.total}</span>
              <span className="hidden sm:block text-sm text-ok text-right tabular-nums">{dia.extraidos}</span>
              <span className={`hidden sm:block text-sm text-right tabular-nums ${dia.agAprovacao > 0 ? 'text-warn' : 'text-text-tertiary'}`}>
                {dia.agAprovacao}
              </span>
              <span className={`hidden sm:block text-sm text-right tabular-nums ${dia.erros > 0 ? 'text-danger' : 'text-text-tertiary'}`}>
                {dia.erros}
              </span>
              <span className={`hidden sm:block text-sm text-right tabular-nums ${dia.pendentes > 0 ? 'text-accent' : 'text-text-tertiary'}`}>
                {dia.pendentes}
              </span>
              <span className="hidden sm:block text-sm text-right tabular-nums text-text-tertiary">
                {dia.naMao}
              </span>
              <span className="hidden sm:block text-sm text-right tabular-nums text-text-tertiary">
                {dia.ignorados}
              </span>
            </li>
          ))}
        </ul>
      </div>
      )}
      </div>
    </div>
  )
}
