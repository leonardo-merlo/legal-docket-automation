'use client'
// client component: usa estado, fetch e polling no navegador para refletir o status do comando.

// Dois botões, e não um, porque abrir os sistemas e extrair são coisas com
// tempos diferentes. Num clique só, os sistemas que não têm como detectar login
// (eProc, TRF6, RUPE) eram tentados no instante em que o Chrome abria, falhavam
// porque ninguém tinha logado ainda e gastavam uma das 4 tentativas à toa — em
// 15/08 o RUPE gastou as 4 assim e ficou de fora da rodada inteira.
//
// Separado, o login não tem relógio nenhum correndo: abre, loga com calma
// (o eProc e o RUPE ainda pedem um código que chega por e-mail), e só então
// manda extrair.

import { useEffect, useState, useSyncExternalStore } from 'react'
import { STATUS_ATIVOS } from '@/lib/comandos/rodada-abandonada'
import { formatarDuracao, type Progresso } from '@/lib/comandos/progresso'

type Comando = {
  id: string
  acao: string
  status: string
  mensagem: string | null
  computador: string | null
  criado_em: string
  atualizado_em: string
}

const LABELS: Record<string, string> = {
  pendente: 'Aguardando o agente local…',
  em_andamento: 'Em andamento…',
  concluido: 'Concluído',
  erro: 'Erro',
}

// O que a tela diz quando o último comando ficou preso em 'em_andamento'. Sem
// esta frase o painel só mostrava a mensagem congelada da rodada morta
// ("Extraindo os processos…") com os dois botões cinzas, e não havia como o
// Rafael distinguir "está rodando agora" de "travou há oito dias".
const AVISO_ABANDONADA =
  'A rodada anterior não foi encerrada — o agente parou no meio. Pode iniciar de novo.'

type AgenteNoPainel = {
  id: string
  rotulo: string
  ligado: boolean
}

// Qual computador é este navegador. Fica no localStorage porque o login é o
// mesmo nos dois computadores — o painel não tem outro jeito de saber.
const CHAVE_COMPUTADOR = 'controladoria.computador'
const EVENTO_COMPUTADOR = 'controladoria-computador'
// Navegador que só acompanha o painel (o do Leonardo, por exemplo): não é
// nenhuma das máquinas com agente, e por isso não pode mandar rodar nada.
const NENHUM_COMPUTADOR = 'nenhum'

function lerComputador(): string | null {
  try {
    return window.localStorage.getItem(CHAVE_COMPUTADOR)
  } catch {
    return null
  }
}

function gravarComputador(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CHAVE_COMPUTADOR, id)
    else window.localStorage.removeItem(CHAVE_COMPUTADOR)
  } catch {
    // navegador sem armazenamento: a escolha vale só até recarregar a página
  }
  window.dispatchEvent(new Event(EVENTO_COMPUTADOR))
}

function assinarComputador(aviso: () => void): () => void {
  window.addEventListener(EVENTO_COMPUTADOR, aviso)
  window.addEventListener('storage', aviso)
  return () => {
    window.removeEventListener(EVENTO_COMPUTADOR, aviso)
    window.removeEventListener('storage', aviso)
  }
}

export default function BotaoIniciar() {
  const [comando, setComando] = useState<Comando | null>(null)
  // Rodada velha demais para ainda contar como ativa. Quem decide é a API, que
  // aplica o mesmo limite usado pelo agente — ver lib/comandos/rodada-abandonada.ts.
  const [abandonada, setAbandonada] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)
  // A API recusa um segundo comando enquanto houver rodada ativa (409). Sem este
  // aviso o clique não fazia nada e nada explicava o porquê.
  const [aviso, setAviso] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<Progresso | null>(null)
  // Só serve para o cronômetro andar entre uma consulta e outra.
  const [agora, setAgora] = useState(() => new Date())
  const [agentes, setAgentes] = useState<AgenteNoPainel[]>([])
  const [carregou, setCarregou] = useState(false)
  const escolhido = useSyncExternalStore(assinarComputador, lerComputador, () => null)

  async function carregarUltimo() {
    const res = await fetch('/api/comandos', { cache: 'no-store' })
    const {
      data,
      abandonada: estaAbandonada,
      progresso: progressoAtual,
      agentes: registrados,
    } = await res.json()
    setComando(data ?? null)
    setAbandonada(Boolean(estaAbandonada))
    setProgresso(progressoAtual ?? null)
    setAgentes(registrados ?? [])
    setCarregou(true)
  }

  useEffect(() => {
    carregarUltimo()
    const id = setInterval(carregarUltimo, 3000)
    return () => clearInterval(id)
  }, [])

  async function enviar(acao: string) {
    setEnviando(acao)
    setAviso(null)
    try {
      const res = await fetch('/api/comandos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, computador: esteComputador?.id }),
      })
      if (!res.ok) {
        const { error, jaAtivo } = await res.json().catch(() => ({}))
        setAviso(
          jaAtivo
            ? 'Já existe uma rodada em andamento. Espere ela terminar.'
            : (error ?? 'Não consegui enviar o comando. Tente de novo em instantes.')
        )
      }
      await carregarUltimo()
    } finally {
      setEnviando(null)
    }
  }

  // Rodada abandonada não ocupa mais o agente, então também não pode travar o
  // botão: era exatamente essa a diferença entre o que a API aceitava e o que a
  // tela deixava clicar.
  const rodadaAtiva =
    comando !== null && STATUS_ATIVOS.includes(comando.status) && !abandonada

  // Nenhum agente registrado ainda (máquinas sem atualizar): segue como antes,
  // sem perguntar nada e sem mandar computador no pedido.
  const esteComputador = agentes.find((agente) => agente.id === escolhido) ?? null
  const soAcompanha = escolhido === NENHUM_COMPUTADOR
  const precisaEscolher = carregou && agentes.length > 0 && esteComputador === null && !soAcompanha
  const agenteDesligado = esteComputador !== null && !esteComputador.ligado
  const ocupado = enviando !== null || rodadaAtiva || precisaEscolher || agenteDesligado
  const ondeRoda = agentes.find((agente) => agente.id === comando?.computador)?.rotulo

  useEffect(() => {
    if (!rodadaAtiva) return
    const id = setInterval(() => setAgora(new Date()), 1000)
    return () => clearInterval(id)
  }, [rodadaAtiva])

  const andamento =
    rodadaAtiva && comando
      ? [
          ondeRoda
            ? `Rodando no computador de ${ondeRoda} há ${formatarDuracao(comando.criado_em, agora)}`
            : `Rodando há ${formatarDuracao(comando.criado_em, agora)}`,
          progresso ? `${progresso.feitos} de ${progresso.total} processos` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null

  const textoStatus = comando
    ? abandonada
      ? AVISO_ABANDONADA
      : (comando.mensagem ?? LABELS[comando.status] ?? comando.status)
    : null

  if (soAcompanha) {
    return (
      <p className="text-right text-xs text-text-tertiary">
        Este computador não roda extração ·{' '}
        <button onClick={() => gravarComputador(null)} className="underline">
          trocar
        </button>
      </p>
    )
  }

  if (precisaEscolher) {
    return (
      <div className="flex flex-col items-end gap-2">
        <p className="text-right text-sm font-medium text-text">Qual é este computador?</p>
        <div className="flex flex-wrap justify-end gap-2">
          {agentes.map((agente) => (
            <button
              key={agente.id}
              onClick={() => gravarComputador(agente.id)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text"
            >
              {agente.rotulo}
            </button>
          ))}
          <button
            onClick={() => gravarComputador(NENHUM_COMPUTADOR)}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm text-text-tertiary"
          >
            Nenhum destes
          </button>
        </div>
        <p className="max-w-md text-right text-xs text-text-tertiary">
          Marque uma vez só. A extração vai rodar no computador escolhido.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {esteComputador && (
        <p className="text-right text-xs text-text-tertiary">
          Este computador: {esteComputador.rotulo} ·{' '}
          <button onClick={() => gravarComputador(null)} className="underline">
            trocar
          </button>
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => enviar('abrir_sistemas')}
          disabled={ocupado}
          className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text disabled:opacity-50"
        >
          1. Abrir sistemas
        </button>
        <button
          onClick={() => enviar('extrair')}
          disabled={ocupado}
          className="inline-flex items-center justify-center rounded-md bg-text px-4 py-2 text-sm font-medium text-bg disabled:opacity-50"
        >
          2. Iniciar extração
        </button>
      </div>
      {agenteDesligado && (
        <p className="max-w-md text-right text-xs text-amber-700">
          O agente deste computador está desligado. Abra o Agente Controladoria na área de
          trabalho e espere alguns segundos.
        </p>
      )}
      {aviso && <p className="text-xs text-amber-700 text-right">{aviso}</p>}
      {andamento && (
        <p className="text-right text-xs font-medium text-text tabular-nums">{andamento}</p>
      )}
      {textoStatus && (
        <p className="max-w-md text-right text-xs text-text-tertiary">{textoStatus}</p>
      )}
    </div>
  )
}
