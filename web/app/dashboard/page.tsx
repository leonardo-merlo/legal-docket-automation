export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestor } from '@/lib/auth/usuario-atual'
import AppHeader from '@/components/app-header'
import StatusGmail from '@/components/gmail/status-gmail'
import { carregarPainelGmail } from '@/lib/gmail/painel'
import EntradasPorDia from './EntradasPorDia'
import { type EntradaPublicacao } from './metricas'
import { Tables } from '@/lib/supabase/types'
import { atribuirRascunhos, resolverPublicacoes } from '@/lib/publicacoes'
import { type RevisaoLinha } from './qualidade'
import { type LinhaMotivo } from './erros'

// O PostgREST devolve no máximo 1000 linhas por resposta e não avisa quando corta:
// pedir "tudo" e receber 1000 de 4472 é o tipo de erro que não quebra nada e faz
// toda porcentagem descrever uma amostra se apresentando como total. Daí paginar.
const TAMANHO_PAGINA = 1000
// Trava contra laço infinito caso o servidor sempre devolva página cheia.
const MAX_PAGINAS = 50

type LinhaPublicacao = Pick<
  Tables<'publicacoes'>,
  'id' | 'processo_id' | 'pauta' | 'criada_em' | 'pje_status' | 'duracao_extracao_s' | 'duplicata'
>

async function fetchPublicacoes(): Promise<LinhaPublicacao[]> {
  const supabase = createAdminClient()
  const todas: LinhaPublicacao[] = []

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * TAMANHO_PAGINA
    const { data, error } = await supabase
      .from('publicacoes')
      .select('id, processo_id, pauta, criada_em, pje_status, duracao_extracao_s, duplicata')
      // ordenado por id, não por data: paginar sobre coluna com repetição pode
      // pular ou repetir linha entre páginas. A ordem de exibição é decidida
      // depois, no agrupamento por dia.
      .order('id', { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1)

    if (error) throw new Error(error.message)
    const lote = data ?? []
    todas.push(...lote)
    if (lote.length < TAMANHO_PAGINA) break
  }

  return todas
}

type LinhaRascunho = Pick<
  Tables<'rascunhos'>,
  'id' | 'processo_id' | 'status' | 'custo_usd' | 'modelo_ia' | 'data_extracao' | 'data_criacao' | 'publicacao_id'
>

async function fetchRascunhos(): Promise<LinhaRascunho[]> {
  const supabase = createAdminClient()
  const todos: LinhaRascunho[] = []

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * TAMANHO_PAGINA
    const { data, error } = await supabase
      .from('rascunhos')
      .select('id, processo_id, status, custo_usd, modelo_ia, data_extracao, data_criacao, publicacao_id')
      .order('id', { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1)

    if (error) throw new Error(error.message)
    const lote = data ?? []
    todos.push(...lote)
    if (lote.length < TAMANHO_PAGINA) break
  }

  return todos
}

interface DadosRascunhos {
  /**
   * Quantos rascunhos de cada publicação esperam aprovação. Conta cada um: o
   * rascunho antigo continua esperando até ser aprovado ou rejeitado, mesmo com
   * um mais novo no mesmo processo.
   */
  aguardandoPorPublicacao: Map<string, number>
  custoPorPublicacao: Map<string, number>
  /**
   * rascunho → publicação. É o único caminho de uma revisão até a data da pauta,
   * e sem ele o cartão de qualidade não teria como seguir o filtro de mês:
   * `revisoes_rascunho` só conhece o rascunho.
   */
  rascunhoParaPublicacao: Map<string, string>
  /**
   * Rascunhos que a IA não escreveu: o gestor assumiu o processo à mão e
   * preencheu tudo do zero. Sem modelo gravado. Ficam fora do cartão de
   * qualidade — até 16/10 eram metade dos "revisados" e cada campo preenchido
   * contava como correção da IA.
   */
  rascunhosSemIa: Set<string>
}

function organizarRascunhos(publicacoes: LinhaPublicacao[], rascunhos: LinhaRascunho[]): DadosRascunhos {
  // a publicação gravada no rascunho vale; a regra de horário cobre o que vier sem
  const porHorario = atribuirRascunhos(publicacoes, rascunhos)
  const rascunhoParaPublicacao = new Map(
    rascunhos.flatMap((r) => {
      const publicacaoId = r.publicacao_id ?? porHorario.get(r.id)
      return publicacaoId ? [[r.id, publicacaoId] as const] : []
    })
  )
  const aguardandoPorPublicacao = new Map<string, number>()
  const custoPorPublicacao = new Map<string, number>()
  const rascunhosSemIa = new Set<string>()

  for (const rascunho of rascunhos) {
    if (rascunho.modelo_ia === null) rascunhosSemIa.add(rascunho.id)
    const publicacaoId = rascunhoParaPublicacao.get(rascunho.id)
    if (!publicacaoId) continue
    if (rascunho.status === 'pendente') {
      aguardandoPorPublicacao.set(publicacaoId, (aguardandoPorPublicacao.get(publicacaoId) ?? 0) + 1)
    }
    if (rascunho.custo_usd !== null) {
      // uma publicação pode ter mais de um rascunho (reanálise); o custo dela é
      // o que foi gasto nela, somado
      const acumulado = custoPorPublicacao.get(publicacaoId) ?? 0
      custoPorPublicacao.set(publicacaoId, acumulado + Number(rascunho.custo_usd))
    }
  }

  return { aguardandoPorPublicacao, custoPorPublicacao, rascunhoParaPublicacao, rascunhosSemIa }
}

function paraEntradas(publicacoes: LinhaPublicacao[]): EntradaPublicacao[] {
  const resolvidas = resolverPublicacoes(publicacoes)
  return publicacoes.map((publicacao) => ({
    id: publicacao.id,
    processo_id: publicacao.processo_id,
    pauta: publicacao.pauta,
    statusEfetivo: resolvidas.get(publicacao.id)?.statusEfetivo ?? publicacao.pje_status,
    duracao_extracao_s: publicacao.duracao_extracao_s,
    duplicata: publicacao.duplicata,
  }))
}

/** As revisões cruas. Quem agrupa e filtra por mês é o cliente. */
async function fetchRevisoes(): Promise<RevisaoLinha[]> {
  const supabase = createAdminClient()
  const revisoes: RevisaoLinha[] = []

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * TAMANHO_PAGINA
    const { data, error } = await supabase
      .from('revisoes_rascunho')
      .select('rascunho_id, acao, motivos')
      .order('id', { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1)

    if (error) break
    const lote = (data ?? []) as RevisaoLinha[]
    revisoes.push(...lote)
    if (lote.length < TAMANHO_PAGINA) break
  }

  return revisoes
}

/**
 * As publicações que não fecharam, cada uma no dia da sua pauta. Até 17/10/2026
 * a fonte era `processos`, que só guarda o estado de agora: a falha de um dia
 * sumia quando o processo saía de novo na pauta. Não marca se a falha foi
 * resolvida depois — o cartão responde o que aconteceu naquele dia.
 *
 * 'processado' fica de fora: ele também pode ter motivo gravado (o aviso de
 * "análise não gerada", por exemplo), mas esse processo está no painel, com
 * documentos, e não é o que este cartão responde. Ficam 'erro_*',
 * 'captcha_bloqueado', 'ignorado' e os 'pendente' que voltaram para a fila com
 * uma explicação — a sessão que caiu no meio da rodada é o motivo mais comum de
 * fila parada e some do painel se for excluída daqui.
 *
 * 'tratado_manual' entra: este cartão mostra por que a extração falhou, e o
 * gestor fazer o processo na mão não desfaz a falha. Até 08/10/2026 ele saía
 * daqui, e com 86 processos feitos à mão o cartão dizia "nenhum processo parado
 * por falha" enquanto o robô tinha extraído menos da metade. Só sai quem for
 * extraído de verdade numa rodada seguinte ('processado').
 */
async function fetchLinhasMotivo(): Promise<LinhaMotivo[]> {
  const supabase = createAdminClient()
  const linhas: LinhaMotivo[] = []

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * TAMANHO_PAGINA
    const { data, error } = await supabase
      .from('publicacoes')
      .select('id, processo_id, pauta, pje_status, motivo_ignorado, processo:processos(numero_cnj)')
      .not('motivo_ignorado', 'is', null)
      // substituída nem foi tentada: o motivo que ficou nela é de uma rodada que
      // não chegou nela
      .not('pje_status', 'in', '(processado,substituida)')
      .order('id', { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1)

    if (error) break
    const lote = data ?? []
    for (const publicacao of lote) {
      linhas.push({
        id: publicacao.processo_id,
        numero_cnj: publicacao.processo?.numero_cnj ?? '',
        pje_status: publicacao.pje_status,
        motivo_ignorado: publicacao.motivo_ignorado,
        pauta: publicacao.pauta,
      })
    }
    if (lote.length < TAMANHO_PAGINA) break
  }

  return linhas
}

async function fetchCountTarefasAbertas(): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('tarefas')
    .select('*', { count: 'exact', head: true })
    .eq('status_tarefa', 'aberta')
  if (error) return 0
  return count ?? 0
}

export default async function DashboardPage() {
  const usuario = await requireGestor()

  const [publicacoes, linhasRascunho, tarefasCount, revisoes, linhasMotivo, dadosGmail] = await Promise.all([
    fetchPublicacoes(),
    fetchRascunhos(),
    fetchCountTarefasAbertas(),
    fetchRevisoes(),
    fetchLinhasMotivo(),
    // o painel de processos não pode cair junto se o Gmail falhar
    carregarPainelGmail().catch(() => null),
  ])

  const entradas = paraEntradas(publicacoes)
  const rascunhos = organizarRascunhos(publicacoes, linhasRascunho)

  return (
    <div className="min-h-screen bg-bg">
      <AppHeader active="dashboard" usuario={usuario} />

      <main className="mx-auto max-w-5xl px-4 py-8">
        {dadosGmail && <div className="mb-6"><StatusGmail dados={dadosGmail} /></div>}
        {/* Os três cartões de baixo recebem dado CRU, e não pronto: eles seguem o
            filtro de mês, que só existe no cliente. Enviar o número já calculado
            aqui era o que fazia a taxa mudar com o filtro e os cartões não —
            dois períodos diferentes na mesma tela, sem nada avisando. */}
        <EntradasPorDia
          entradas={entradas}
          aguardandoPorPublicacao={rascunhos.aguardandoPorPublicacao}
          custoPorPublicacao={rascunhos.custoPorPublicacao}
          rascunhoParaPublicacao={rascunhos.rascunhoParaPublicacao}
          tarefasCount={tarefasCount}
          revisoes={revisoes.filter((r) => !rascunhos.rascunhosSemIa.has(r.rascunho_id))}
          linhasMotivo={linhasMotivo}
        />
      </main>
    </div>
  )
}
