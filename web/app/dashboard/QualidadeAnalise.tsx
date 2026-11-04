// Três cartões numa segunda fileira, um terço da largura cada. Ficam separados
// dos quatro primeiros de propósito: aqueles respondem "como o robô rodou hoje",
// estes respondem "quanto a análise acertou" e "o que deu errado". São perguntas
// diferentes, e enfileirar todas faz o leitor comparar o que não se compara.

import { motivoLabel } from '@/lib/revisao'
import { Qualidade } from './qualidade'
import { MotivoErro } from './erros'
import MotivosFalha from './MotivosFalha'

const MOTIVOS_VISIVEIS = 6

function Cartao({ titulo, detalhe, children }: {
  titulo: string
  detalhe: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs uppercase tracking-wide text-text-tertiary">{titulo}</span>
        <span className="text-xs text-text-tertiary">{detalhe}</span>
      </div>
      {children}
    </div>
  )
}

function Contagem({ rotulo, valor, total, cor }: {
  rotulo: string
  valor: number
  total: number
  cor: string
}) {
  const largura = total === 0 ? 0 : Math.round((valor / total) * 100)
  return (
    <div className="min-w-0">
      <div className="text-2xl font-semibold tabular-nums text-text">{valor}</div>
      <div className="mt-1 h-1 w-full rounded-full bg-border-subtle">
        <div className={`h-1 rounded-full ${cor}`} style={{ width: `${largura}%` }} />
      </div>
      <div className="mt-1.5 text-xs leading-tight text-text-tertiary">{rotulo}</div>
    </div>
  )
}

export default function QualidadeAnalise({
  qualidade,
  motivosErro,
}: {
  qualidade: Qualidade
  motivosErro: MotivoErro[]
}) {
  const { aprovadosDireto, aprovadosComEdicao, rejeitados, totalRevisados, motivos } = qualidade
  const motivosVisiveis = motivos.slice(0, MOTIVOS_VISIVEIS)
  const maiorMotivo = motivosVisiveis[0]?.total ?? 0

  const totalFalhas = motivosErro.reduce((soma, m) => soma + m.total, 0)

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* "Motivos de falha", e não "de erro": metade do que aparece aqui não é o
          extrator errando — é login que não foi feito, tribunal sem extrator,
          processo que não existe naquele sistema. Chamar tudo de erro faria o
          Rafael procurar defeito onde não há.
          Primeiro da fileira: é o único que pede ação hoje. */}
      <Cartao
        titulo="Motivos de falha"
        detalhe={
          totalFalhas === 0
            ? 'nada parado'
            : `${totalFalhas} processo${totalFalhas !== 1 ? 's' : ''} · clique para ver`
        }
      >
        <MotivosFalha motivos={motivosErro} />
      </Cartao>

      <Cartao
        titulo="Qualidade da análise"
        detalhe={
          totalRevisados === 0
            ? 'nenhum revisado ainda'
            : `${totalRevisados} rascunho${totalRevisados !== 1 ? 's' : ''} da IA revisado${totalRevisados !== 1 ? 's' : ''}`
        }
      >
        {/* Contagens absolutas, e não porcentagem: nas primeiras semanas do
            piloto o denominador é pequeno, e "73% de acerto" sobre 11 rascunhos
            oscila nove pontos a cada clique. */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Contagem rotulo="Aprovados direto" valor={aprovadosDireto} total={totalRevisados} cor="bg-ok" />
          <Contagem rotulo="Com edição" valor={aprovadosComEdicao} total={totalRevisados} cor="bg-warn" />
          <Contagem rotulo="Rejeitados" valor={rejeitados} total={totalRevisados} cor="bg-danger" />
        </div>
      </Cartao>

      <Cartao
        titulo="Motivos de mudança"
        detalhe={motivosVisiveis.length === 0 ? 'nada registrado ainda' : 'do mais frequente'}
      >
        {motivosVisiveis.length === 0 ? (
          <p className="mt-3 text-sm text-text-tertiary">
            Aparece aqui assim que um rascunho for editado ou rejeitado.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {motivosVisiveis.map(({ motivo, total }) => (
              // rótulo mais estreito do que quando este cartão ocupava meia
              // largura: em um terço, 150px de rótulo não deixavam barra para ver
              <li key={motivo} className="grid grid-cols-[minmax(70px,110px)_1fr_24px] items-center gap-2">
                <span className="truncate text-xs text-text-secondary" title={motivoLabel(motivo)}>
                  {motivoLabel(motivo)}
                </span>
                <span className="h-1.5 rounded-full bg-border-subtle">
                  {/* Barra proporcional ao maior motivo, não ao total: com um
                      motivo dominante, escala sobre o total deixaria os outros
                      cinco todos invisíveis. */}
                  <span
                    className="block h-1.5 rounded-full bg-text-tertiary"
                    style={{ width: `${maiorMotivo === 0 ? 0 : Math.round((total / maiorMotivo) * 100)}%` }}
                  />
                </span>
                <span className="text-right text-xs tabular-nums text-text-tertiary">{total}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  )
}
