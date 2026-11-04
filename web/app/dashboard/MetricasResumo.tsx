// Os quatro números do topo do dashboard.
//
// Nenhum cartão é escondido por falta de dado: um número que some é pior que um
// número vazio, porque quem olha não sabe se a métrica não existe, se quebrou ou
// se ainda não foi medida. Sem dado, o cartão aparece zerado com a frase.

import { Metricas, formatarDuracao } from './metricas'

const SEM_DADOS = 'dados ainda não coletados'

// Faixas da taxa de extração. Abaixo de 70% é mais ou menos um em cada três
// processos ficando para trás — vermelho. De 70 a 90, amarelo: funciona, mas
// alguma coisa falha com regularidade e vale investigar.
const TAXA_BOA = 0.9
const TAXA_ATENCAO = 0.7

function corDaTaxa(taxa: number): string {
  if (taxa >= TAXA_BOA) return 'text-green-600'
  if (taxa >= TAXA_ATENCAO) return 'text-amber-600'
  return 'text-red-600'
}

function Cartao({
  rotulo,
  valor,
  detalhe,
  vazio,
  corValor,
  textoVazio,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  vazio: boolean
  corValor?: string
  /** Frase no lugar de "dados ainda não coletados" quando há algo melhor a dizer. */
  textoVazio?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface px-4 py-5 text-center">
      <span className="text-xs uppercase tracking-wide text-text-tertiary">{rotulo}</span>
      <span
        className={`mt-2 text-3xl font-semibold tabular-nums ${
          vazio ? 'text-text-tertiary' : corValor ?? 'text-text'
        }`}
      >
        {valor}
      </span>
      <span className="mt-1 text-xs text-text-tertiary">
        {vazio ? textoVazio ?? SEM_DADOS : detalhe ?? ' '}
      </span>
    </div>
  )
}

function aguardandoRodada(pendentes: number): string {
  return `${pendentes} aguardando rodada`
}

function detalheDaTaxa(extraidos: number, tentados: number, pendentes: number): string {
  const base = `${extraidos} de ${tentados} tentados`
  return pendentes > 0 ? `${base} · ${aguardandoRodada(pendentes)}` : base
}

export default function MetricasResumo({ metricas }: { metricas: Metricas }) {
  const {
    taxaExtracao,
    aguardandoAprovacao,
    custoMedioUsd,
    processosComCusto,
    tempoMedioS,
    processosComTempo,
  } = metricas

  const taxaVazia = taxaExtracao === null
  const custoVazio = custoMedioUsd === null
  const tempoVazio = tempoMedioS === null

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Cartao
        rotulo="Taxa de extração"
        // traço, e não 0%: nada tentado não é o mesmo que tudo falhou
        valor={taxaVazia ? '—' : `${Math.round(taxaExtracao * 100)}%`}
        // só "61 de 67": a quebra do que falhou mora no cartão "Motivos de
        // falha", com nome e CNJ. Repetir aqui em miniatura só competia com ele.
        // O que ainda espera rodada aparece ao lado: fica fora da conta, mas não
        // pode sumir da tela.
        detalhe={detalheDaTaxa(metricas.extraidos, metricas.totalTentado, metricas.pendentes)}
        textoVazio={metricas.pendentes > 0 ? aguardandoRodada(metricas.pendentes) : undefined}
        vazio={taxaVazia}
        corValor={taxaVazia ? undefined : corDaTaxa(taxaExtracao)}
      />
      <Cartao
        rotulo="Aguardando aprovação"
        valor={String(aguardandoAprovacao)}
        detalhe={aguardandoAprovacao === 1 ? 'rascunho para revisar' : 'rascunhos para revisar'}
        vazio={false}
      />
      <Cartao
        rotulo="Custo por processo"
        // três casas: com duas, um processo de US$ 0,043 vira US$ 0,04 e some a
        // diferença entre um processo magro e um gordo
        valor={custoVazio ? 'US$ 0,000' : `US$ ${custoMedioUsd.toFixed(3)}`}
        detalhe={`média de ${processosComCusto} processo${processosComCusto !== 1 ? 's' : ''}`}
        vazio={custoVazio}
      />
      <Cartao
        rotulo="Tempo por processo"
        valor={tempoVazio ? '0s' : formatarDuracao(tempoMedioS)}
        detalhe={`média de ${processosComTempo} processo${processosComTempo !== 1 ? 's' : ''}`}
        vazio={tempoVazio}
      />
    </div>
  )
}
