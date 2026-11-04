export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { Tables } from '@/lib/supabase/types'
import AppHeader from '@/components/app-header'
import ProcessosList, { AnaliseResumo } from './ProcessosList'
import { requireGestor } from '@/lib/auth/usuario-atual'
import { formatPrazoDate } from '@/lib/prazo'
import { atribuirRascunhos, resolverPublicacoes } from '@/lib/publicacoes'

type ProcessoItem = Pick<
  Tables<'processos'>,
  'id' | 'numero_cnj' | 'numero_publicacao' | 'polo_ativo' | 'polo_passivo' | 'vara' | 'comarca' | 'pje_status' | 'duplicata' | 'classe_processual' | 'observacoes' | 'sistema' | 'motivo_ignorado'
>

function formatData(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export default async function EntradasDataPage({
  params,
}: {
  params: Promise<{ data: string }>
}) {
  const usuario = await requireGestor()
  const { data } = await params

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) notFound()

  const supabase = createAdminClient()

  // A lista é das publicações desta pauta, e não dos processos cujo lote_id é
  // esta data: lote_id guarda só a pauta mais recente, e o processo que saía de
  // novo sumia do dia antigo e aparecia no novo com a análise do antigo.
  const publicacoesRes = await supabase
    .from('publicacoes')
    .select('id, processo_id, numero_publicacao, pje_status, motivo_ignorado, duplicata, processo:processos(id, numero_cnj, polo_ativo, polo_passivo, vara, comarca, classe_processual, observacoes, sistema)')
    .eq('pauta', data)

  if (publicacoesRes.error) throw new Error(publicacoesRes.error.message)

  const doDia = publicacoesRes.data ?? []
  const processoIds = doDia.map((p) => p.processo_id)

  // Todas as publicações destes processos, de qualquer dia: é o que diz se a
  // desta pauta foi substituída e a qual delas cada rascunho pertence. Os
  // rascunhos vêm só destes processos — o PostgREST corta em 1000 linhas sem
  // avisar, e pedir a tabela inteira esconderia análises daqui a alguns meses.
  const [todasRes, rascunhosRes] = processoIds.length
    ? await Promise.all([
        supabase
          .from('publicacoes')
          .select('id, processo_id, pauta, criada_em, pje_status')
          .in('processo_id', processoIds),
        supabase
          .from('rascunhos')
          .select('id, processo_id, publicacao_id, data_extracao, data_criacao, status, status_sugerido, classificacao_risco, cenario_prazo, prazo_fatal_dias_uteis')
          .in('processo_id', processoIds)
          .order('data_criacao', { ascending: false }),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]

  if (todasRes.error) throw new Error(todasRes.error.message)
  if (rascunhosRes.error) throw new Error(rascunhosRes.error.message)

  const todas = todasRes.data ?? []
  const rascunhos = rascunhosRes.data ?? []
  const resolvidas = resolverPublicacoes(todas)
  // a publicação gravada no rascunho vale; a regra de horário cobre o que vier sem
  const porHorario = atribuirRascunhos(todas, rascunhos)
  const donoDoRascunho = new Map(
    rascunhos.flatMap((r) => {
      const dono = r.publicacao_id ?? porHorario.get(r.id)
      return dono ? [[r.id, dono] as const] : []
    })
  )
  const pautaDaPublicacao = new Map(todas.map((p) => [p.id, p.pauta]))
  const idPorProcessoEPauta = new Map(todas.map((p) => [`${p.processo_id}|${p.pauta}`, p.id]))

  // Mais de um rascunho na mesma publicação (reanálise): vale o mais recente,
  // que vem primeiro pela ordenação.
  const rascunhoPorPublicacao = new Map<string, (typeof rascunhos)[number]>()
  for (const rascunho of rascunhos) {
    const dono = donoDoRascunho.get(rascunho.id)
    if (dono && !rascunhoPorPublicacao.has(dono)) rascunhoPorPublicacao.set(dono, rascunho)
  }

  const lista: ProcessoItem[] = []
  const analisePorProcesso = new Map<string, AnaliseResumo>()
  const avisos = new Map<string, string>()

  for (const publicacao of doDia) {
    const processo = publicacao.processo
    if (!processo) continue
    const resolvida = resolvidas.get(publicacao.id)

    lista.push({
      ...processo,
      numero_publicacao: publicacao.numero_publicacao,
      pje_status: resolvida?.statusEfetivo ?? publicacao.pje_status,
      motivo_ignorado: publicacao.motivo_ignorado,
      duplicata: publicacao.duplicata,
    })

    // A substituída mostra a análise da publicação que a cobriu.
    const analisadaCom = resolvida?.analisadaCom ?? null
    const idDaAnalise = analisadaCom
      ? idPorProcessoEPauta.get(`${publicacao.processo_id}|${analisadaCom}`) ?? publicacao.id
      : publicacao.id
    const rascunho = rascunhoPorPublicacao.get(idDaAnalise)
    if (rascunho) {
      analisePorProcesso.set(processo.id, {
        aprovacao: rascunho.status,
        statusSugerido: rascunho.status_sugerido,
        classificacaoRisco: rascunho.classificacao_risco,
        cenarioPrazo: rascunho.cenario_prazo,
        prazoFatal: formatPrazoDate(data, rascunho.prazo_fatal_dias_uteis),
        // Ordenar exige o número de dias, não a data formatada: sem prazo vai
        // para o fim do desempate, e não para a frente dos que têm.
        prazoFatalDias: rascunho.prazo_fatal_dias_uteis,
      })
    }

    if (analisadaCom) {
      avisos.set(processo.id, `Saiu de novo em ${formatData(analisadaCom)} antes da rodada: a análise de lá vale para esta.`)
    } else if (!rascunho && publicacao.pje_status === 'pendente') {
      // só os rascunhos DESTE processo: a lista tem os de todos os processos do
      // dia, e sem o filtro todo pendente herdava a análise de outro (17/10/2026)
      const anterior = rascunhos.find((r) => {
        if (r.processo_id !== publicacao.processo_id) return false
        const dono = donoDoRascunho.get(r.id)
        return dono !== undefined && dono !== publicacao.id && (pautaDaPublicacao.get(dono) ?? '') < data
      })
      const pautaAnterior = anterior ? pautaDaPublicacao.get(donoDoRascunho.get(anterior.id) ?? '') : undefined
      if (pautaAnterior) {
        avisos.set(processo.id, `Publicação nova, ainda sem rodada. Já foi analisado na pauta de ${formatData(pautaAnterior)}.`)
      }
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Dez colunas não cabem nos 1024px do resto do sistema: com o container
          padrão os selos de Aprovação e Status encostavam um no outro. Esta é a
          única tela em que a densidade da tabela manda na largura. */}
      <AppHeader active="dashboard" usuario={usuario} largura="max-w-7xl" />

      <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-text-tertiary hover:text-text transition-colors">
            ← Dashboard
          </Link>
        </div>

        <div>
          <h1 className="text-xl font-semibold text-text">
            Publicações de {formatData(data)}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {lista.length === 0
              ? 'Nenhum processo registrado para esta data de publicação.'
              : `${lista.length} processo${lista.length > 1 ? 's' : ''} registrado${lista.length > 1 ? 's' : ''}`}
          </p>
        </div>

        {lista.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-6 py-10 text-center text-sm text-text-tertiary">
            Nenhum processo encontrado para esta data.
          </div>
        ) : (
          <ProcessosList processos={lista} analises={analisePorProcesso} avisos={avisos} />
        )}
      </main>
    </div>
  )
}
