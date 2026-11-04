// Qual sistema judicial o número do processo indica.
//
// Espelho em TypeScript de `cnj_router.rotear()` do repo do agente
// (controladoria-playwright/cnj_router.py) — mexeu lá, mexa aqui. São duas
// linguagens de propósito: o painel precisa responder "pelo número, parece X"
// sobre processos que já estão no banco há semanas, sem depender de o agente
// rodar de novo para gravar a resposta numa coluna nova.
//
// Diferença importante para o Python: aqui NUNCA se usa o rótulo vindo do e-mail
// (`processos.sistema`). O que interessa é a leitura crua do número, para poder
// compará-la com o sistema em que o processo foi realmente procurado.

const CNJ_PATTERN = /^(\d{7})-(\d{2})\.(\d{4})\.(\d)\.(\d{2})\.(\d{4})$/

/** (segmento, tribunal) → sistema base. */
const SISTEMAS: Record<string, string> = {
  '8|13': 'pje_tjmg',
  '8|19': 'pje_tjrj',
  '4|02': 'eproc_trf2',
  '4|06': 'eproc_trf6',
}

/** No TJMG o 1º dígito do sequencial separa eProc de PJe. Fora da tabela = não adivinha. */
const DIGITO_TJMG: Record<string, string> = { '1': 'eproc_tjmg', '5': 'pje_tjmg' }

/**
 * Unidades da Justiça Federal em Minas Gerais, pela origem (4 últimos dígitos).
 * O TRF6 foi criado em 2022 e assumiu Minas, então processo mineiro antigo nasceu
 * numerado 4.01 e hoje é o TRF6 quem cuida dele. Espelho de ORIGENS_JF_MINAS em
 * cnj_router.py — mexeu lá, mexa aqui.
 */
const ORIGENS_JF_MINAS = new Set(['3821']) // Muriaé

const NOME_SISTEMA: Record<string, string> = {
  pje_tjmg: 'PJe TJMG',
  pje_tjmg_2inst: 'RUPE (TJMG 2ª inst.)',
  eproc_tjmg: 'eProc TJMG',
  pje_tjrj: 'PJe TJRJ',
  eproc_trf2: 'eProc TRF2',
  eproc_trf6: 'eProc JFMG (1ª inst.)',
  eproc_trf6_2g: 'eProc TRF6 (2ª inst.)',
}

/** Sistemas que o agente sabe extrair. O resto vira aviso, não tentativa. */
const IMPLEMENTADOS = new Set([
  'pje_tjmg',
  'eproc_tjmg',
  'eproc_trf6',
  'eproc_trf6_2g',
  'pje_tjmg_2inst',
])

export interface SistemaPeloNumero {
  /** Chave técnica, igual à do agente. `null` quando o número não é um CNJ válido. */
  sistema: string | null
  /** Como chamar isso na tela. */
  nome: string
  /** O agente tem extrator para este sistema? */
  temExtrator: boolean
}

const INVALIDO: SistemaPeloNumero = { sistema: null, nome: 'número inválido', temExtrator: false }

/** A que tribunal cada sistema pertence — (segmento, tribunal) do CNJ. */
const TRIBUNAL_DO_SISTEMA: Record<string, string> = {
  pje_tjmg: '8|13',
  pje_tjmg_2inst: '8|13',
  eproc_tjmg: '8|13',
  pje_tjrj: '8|19',
  eproc_trf2: '4|02',
  eproc_trf6: '4|06',
  eproc_trf6_2g: '4|06',
}

/** Lê a chave (segmento, tribunal) e o sistema base de um CNJ, sem rótulo nenhum. */
function lerNumero(numeroCnj: string): { chave: string; sistemaBase: string | undefined } | null {
  const m = CNJ_PATTERN.exec((numeroCnj ?? '').trim())
  if (!m) return null

  const [, sequencial, , , segmento, tribunal, origem] = m
  const chave = `${segmento}|${tribunal}`
  let sistemaBase: string | undefined = SISTEMAS[chave]

  if (chave === '8|13') {
    // origem 0000 é 2ª instância (RUPE) qualquer que seja o dígito: o sequencial
    // da 2ª instância não segue a convenção 1/5 da 1ª.
    sistemaBase = origem === '0000' ? 'pje_tjmg_2inst' : DIGITO_TJMG[sequencial[0]]
  } else if (chave === '4|06') {
    // Todo 4.06 é federal, do TRF6 — a tabela de dígito acima é do TJMG e
    // aplicá-la aqui mandava processo federal para o tribunal estadual.
    sistemaBase = 'eproc_trf6'
  } else if (chave === '4|01' && ORIGENS_JF_MINAS.has(origem)) {
    // Processo mineiro numerado antes de o TRF6 existir. Ver ORIGENS_JF_MINAS.
    sistemaBase = 'eproc_trf6'
  }

  return { chave, sistemaBase }
}

/**
 * O que o número do processo diz sobre onde ele mora — sem olhar rótulo nenhum.
 *
 * Função pura. É a base de duas coisas na tela: dizer "pelo número parece TRF1,
 * que não tem extrator" num processo que não foi encontrado, e quebrar o ranking
 * de erros por sistema.
 */
export function sistemaPeloNumero(numeroCnj: string): SistemaPeloNumero {
  const lido = lerNumero(numeroCnj)
  if (!lido) return INVALIDO
  return descrever(lido.sistemaBase, lido.chave)
}

function descrever(sistema: string | undefined, chave: string): SistemaPeloNumero {
  if (!sistema) {
    // Tribunal que ninguém mapeou. Na Justiça Federal o código do tribunal É o
    // número do TRF, então dá para nomear sem tabela — "tribunal 4.01" não dizia
    // nada a quem lê o painel.
    const [segmento, tribunal] = chave.split('|')
    return {
      sistema: `nao_mapeado_J${segmento}_TT${tribunal}`,
      nome: segmento === '4' ? `TRF${parseInt(tribunal, 10)}` : `tribunal ${segmento}.${tribunal}`,
      temExtrator: false,
    }
  }
  return {
    sistema,
    nome: NOME_SISTEMA[sistema] ?? sistema,
    temExtrator: IMPLEMENTADOS.has(sistema),
  }
}

const ALIAS_FRACOS = new Set(['pje', 'eproc'])

/**
 * O sistema em que o processo REALMENTE vai ser procurado — número mais rótulo,
 * igualzinho ao `cnj_router.rotear(cnj, hint)` do agente.
 *
 * É o que a tela deve mostrar na coluna "Sistema". Mostrar a coluna `sistema`
 * crua exibia o palpite do e-mail, que às vezes o roteador recusa: um processo
 * do TRF1 rotulado 'pje_2g' aparecia como "RUPE 2ª inst." e, uma linha abaixo,
 * como "Sistema não implementado" — a tela se contradizendo.
 *
 * Regra do rótulo, na ordem: ele só vence dentro do MESMO tribunal (o número
 * manda no tribunal), só se for de um sistema que tem extrator, e nunca quando
 * for um rótulo genérico ('pje', 'eproc') contra um dígito que já decide sozinho.
 */
export function sistemaEfetivo(numeroCnj: string, rotuloDoEmail: string | null): SistemaPeloNumero {
  const lido = lerNumero(numeroCnj)
  if (!lido) return INVALIDO

  const { chave, sistemaBase } = lido
  if (!rotuloDoEmail) return descrever(sistemaBase, chave)

  const hint = ALIAS_DO_EMAIL[rotuloDoEmail] ?? rotuloDoEmail

  const digitoDecideSozinho =
    (chave === '8|13' || chave === '4|06') &&
    sistemaBase !== undefined &&
    ALIAS_FRACOS.has(rotuloDoEmail)

  const mesmoTribunal = TRIBUNAL_DO_SISTEMA[hint] === chave

  if (IMPLEMENTADOS.has(hint) && mesmoTribunal && !digitoDecideSozinho) {
    return descrever(hint, chave)
  }
  return descrever(sistemaBase, chave)
}

/** Nome de tela de uma chave de sistema já conhecida (a que veio do banco, por exemplo). */
export function nomeSistema(sistema: string | null): string {
  if (!sistema) return '—'
  if (NOME_SISTEMA[sistema]) return NOME_SISTEMA[sistema]
  const m = /^nao_mapeado_J(\d)_TT(\d{2})$/.exec(sistema)
  if (m) return m[1] === '4' ? `TRF${parseInt(m[2], 10)}` : `tribunal ${m[1]}.${m[2]}`
  return sistema
}

/**
 * Os rótulos genéricos que a skill do Gmail grava em `processos.sistema` quando
 * lê a Vara do e-mail. Não são chaves de sistema — precisam ser traduzidos antes
 * de comparar com a leitura do número.
 */
const ALIAS_DO_EMAIL: Record<string, string> = {
  pje: 'pje_tjmg',
  pje_2g: 'pje_tjmg_2inst',
  eproc: 'eproc_tjmg',
}
