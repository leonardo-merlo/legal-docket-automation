import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'
import {
  STATUS_ATIVOS,
  limiteAbandonoIso,
  rodadaAbandonada,
} from '@/lib/comandos/rodada-abandonada'
import { resumirProgresso, type Progresso } from '@/lib/comandos/progresso'
import { acharAgente, agenteLigado, rotuloDoAgente, type Agente } from '@/lib/comandos/computadores'

// A regra de "rodada abandonada" mora em lib/comandos/rodada-abandonada.ts, e
// não aqui, porque o GET precisa dela tanto quanto o POST — ver o comentário de
// lá para o que aconteceu enquanto só o POST a conhecia.

// As ações que o agente local sabe executar — a lista tem de bater com ACOES em
// agente.py. 'iniciar' faz tudo num clique (abre, espera o login, extrai) e
// continua aqui porque um agente que ainda não foi atualizado só entende ele.
// 'abrir_sistemas' e 'extrair' são o mesmo fluxo em dois tempos.
const ACOES = ['iniciar', 'abrir_sistemas', 'extrair'] as const
type Acao = (typeof ACOES)[number]

function ehAcaoValida(valor: unknown): valor is Acao {
  return typeof valor === 'string' && (ACOES as readonly string[]).includes(valor)
}

const CAMPOS_COMANDO = 'id, acao, status, mensagem, computador, criado_em, atualizado_em'

export async function POST(request: Request) {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  // Sem corpo = 'iniciar'. O botão antigo faz POST sem corpo nenhum, e ele tem
  // de continuar funcionando enquanto as duas pontas não estiverem atualizadas.
  let acao: Acao = 'iniciar'
  const corpo = await request.json().catch(() => null)
  if (corpo && 'acao' in corpo) {
    if (!ehAcaoValida(corpo.acao)) {
      return NextResponse.json({ error: `Ação inválida: ${String(corpo.acao)}` }, { status: 400 })
    }
    acao = corpo.acao
  }

  const supabase = createAdminClient()

  // Sem computador = qualquer agente pega (painel antigo, ou nenhum agente
  // registrado ainda). Com computador, ele tem de existir e estar ligado: um
  // pedido para agente desligado ficaria pendente e, pela trava abaixo,
  // bloquearia o outro computador até virar rodada abandonada.
  let computador: string | null = null
  if (corpo && typeof corpo.computador === 'string' && corpo.computador) {
    const { data: agentes } = await supabase.from('agentes').select('id, nome, visto_em')
    const agente = acharAgente(corpo.computador, agentes ?? [])
    if (!agente) {
      return NextResponse.json({ error: 'Computador não reconhecido. Escolha de novo qual é este computador.' }, { status: 400 })
    }
    if (!agenteLigado(agente.visto_em)) {
      return NextResponse.json(
        { error: 'O agente deste computador está desligado. Abra o Agente Controladoria na área de trabalho.' },
        { status: 409 }
      )
    }
    computador = agente.id
  }

  // Trava anti-duplicidade: se já existe um comando ativo (pendente ou em
  // andamento), não cria outro — devolve o existente. Impede que cliques
  // repetidos no botão enfileirem várias extrações concorrentes.
  const { data: ativo, error: erroBusca } = await supabase
    .from('comandos')
    .select(CAMPOS_COMANDO)
    .in('status', STATUS_ATIVOS)
    .gte('atualizado_em', limiteAbandonoIso())
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (erroBusca) {
    return NextResponse.json({ error: erroBusca.message }, { status: 500 })
  }
  if (ativo) {
    return NextResponse.json({ data: ativo, jaAtivo: true }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('comandos')
    .insert({ acao, status: 'pendente', computador })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 200 })
}

export async function GET() {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('comandos')
    .select(CAMPOS_COMANDO)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // O comando mais recente continua sendo devolvido mesmo quando velho — é dele
  // que sai o resumo da última rodada ("13 processado(s), 19 com erro"), e
  // filtrar por data aqui apagaria essa informação da tela. O que muda é vir
  // junto o aviso de que ele não conta mais como rodada ativa.
  const abandonada = data ? rodadaAbandonada(data.status, data.atualizado_em) : false

  // Só a rodada viva tem progresso a mostrar; a encerrada já traz o resumo na mensagem.
  let progresso: Progresso | null = null
  if (data && STATUS_ATIVOS.includes(data.status) && !abandonada) {
    const { data: eventos } = await supabase
      .from('eventos_extracao')
      .select('etapa, dados')
      .eq('comando_id', data.id)
      .in('etapa', ['previvo.inicio', 'cnj.fim'])
    progresso = resumirProgresso(eventos ?? [])
  }

  // A lista vai junto para o painel perguntar "qual é este computador?" e dizer
  // em qual a rodada está rodando, sem uma segunda consulta a cada 3s.
  const { data: registrados } = await supabase
    .from('agentes')
    .select('id, nome, visto_em')
    .order('nome')
  const agentes: (Agente & { rotulo: string; ligado: boolean })[] = (registrados ?? []).map(
    (agente, _, todos) => ({
      ...agente,
      rotulo: rotuloDoAgente(agente, todos),
      ligado: agenteLigado(agente.visto_em),
    })
  )

  return NextResponse.json({ data, abandonada, progresso, agentes })
}
