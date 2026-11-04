// Leitura do e-mail do Recorte Digital (OAB/MG). Função pura: nada de banco, nada de
// rede — ver parser.test.ts (dados inventados) e parser.fixture.test.ts (pauta real).
// As regras vêm da tarefa do Cowork; os desvios deliberados estão no plano de
// docs/superpowers/plans/2026-09-10-ingestao-gmail-api.md, seção 2.

export type SistemaProcesso = 'pje' | 'pje_2g' | 'eproc_tjmg' | 'eproc_trf6'
export type StatusParser = 'ok' | 'divergente' | 'sem_cnj'

export interface ProcessoDaPauta {
  numeroCnj: string
  numeroPublicacao: number
  publicacoes: number[]
  vara: string | null
  comarca: string | null
  poloAtivo: string | null
  poloPassivo: string | null
  classeProcessual: string | null
  sistema: SistemaProcesso | null
  observacoes: string | null
}

export interface ResultadoParser {
  loteId: string | null
  totalBlocos: number
  totalFint: number
  totalValidos: number
  totalSemCnj: number
  totalDeclaradoCorpo: number | null
  totalDeclaradoAssunto: number | null
  processos: ProcessoDaPauta[]
  avisos: string[]
  status: StatusParser
}

// Mudou a regra de leitura? Suba a versão: fica gravada em emails_recebidos.parser_versao.
export const VERSAO_PARSER = '1'

const PADRAO_CNJ = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/
// "Publicação: 12." abre bloco; "Publicação: Intimação" é o tipo do ato e não abre.
const INICIO_DE_BLOCO = /^Publica[çc][ãa]o:\s*(\d+)\.\s*$/gm
// Linha que começa um campo novo ("ADVOGADO:", "POLO PASSIVO:", "RELATOR :"). O que
// não casa com isto, logo depois de um POLO, é continuação do nome que quebrou a linha.
const LINHA_COM_ROTULO = /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 ().ºª°\/-]*\s*:/
const DIGITO_PARA_SISTEMA: Record<string, SistemaProcesso> = {
  '1': 'eproc_tjmg',
  '5': 'pje',
  '6': 'eproc_trf6',
}

interface Bloco {
  numero: number
  texto: string
}

export function extrairLoteId(assunto: string): string | null {
  const achado = /(\d{2})\/(\d{2})\/(\d{4}|\d{2})(?!\d)/.exec(assunto)
  if (!achado) return null
  const [, dia, mes, ano] = achado
  return `${dia}/${mes}/${ano.length === 2 ? `20${ano}` : ano}`
}

// 1ª instância sempre traz "vara" (ou "juizado") na linha Vara; a 2ª usa Câmara,
// Turma, Cartório... Decidido com o Leonardo em 10/09/2026: juizado é 1ª instância.
export function identificarSistema(numeroCnj: string, linhaVara: string | null): SistemaProcesso | null {
  if (linhaVara !== null && !/\b(vara|juizado)\b/i.test(linhaVara)) return 'pje_2g'
  return DIGITO_PARA_SISTEMA[numeroCnj.charAt(0)] ?? null
}

function dividirEmBlocos(corpo: string): Bloco[] {
  const marcas = [...corpo.matchAll(INICIO_DE_BLOCO)]
  return marcas.map((marca, indice) => {
    const inicio = (marca.index ?? 0) + marca[0].length
    const proxima = marcas[indice + 1]
    const fim = proxima ? (proxima.index ?? corpo.length) : corpo.length
    return { numero: Number(marca[1]), texto: corpo.slice(inicio, fim) }
  })
}

function campoSimples(texto: string, rotulo: string): string | null {
  const achado = new RegExp(`^${rotulo}:[ \\t]*(.+)$`, 'm').exec(texto)
  const valor = achado?.[1].trim()
  return valor ? valor : null
}

function valoresDoCampo(linhas: string[], rotulo: string): string[] {
  const valores: string[] = []
  linhas.forEach((linha, indice) => {
    if (!linha.startsWith(rotulo)) return
    const partes = [linha.slice(rotulo.length)]
    for (const seguinte of linhas.slice(indice + 1)) {
      if (!seguinte || LINHA_COM_ROTULO.test(seguinte)) break
      partes.push(seguinte)
    }
    const valor = partes
      .join(' ')
      .replace(/\s+(?:ADVOGADO|CPF|CNPJ)\b.*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (valor) valores.push(valor)
  })
  return valores
}

function separarVaraComarca(linhaVara: string | null, cidade: string | null): { vara: string | null; comarca: string | null } {
  if (linhaVara === null) return { vara: null, comarca: cidade }
  const achado = /^(.*?)\s+da\s+Comarca\s+de\s+(.+)$/i.exec(linhaVara)
  if (achado) return { vara: achado[1].trim(), comarca: achado[2].trim() }
  return { vara: linhaVara, comarca: cidade }
}

function extrairClasse(texto: string, numeroCnj: string): string | null {
  const porClasse = /^CLASSE:\s*(?:\[.+?\]\s*)?([^\n(]+)/m.exec(texto)?.[1].trim()
  if (porClasse) return porClasse
  const linhaProcesso = /^PROCESSO:(.*)$/m.exec(texto)?.[1] ?? ''
  const depoisDoCnj = linhaProcesso.split(numeroCnj)[1] ?? ''
  const classe = depoisDoCnj
    .split('||')[0]
    .replace(/^\s*-\s*/, '')
    .replace(/\s*-\s*$/, '')
    .trim()
  return classe ? classe : null
}

function juntar(valores: string[]): string | null {
  return valores.length > 0 ? valores.join(' | ') : null
}

function lerProcesso(bloco: Bloco, numeroCnj: string, avisos: string[]): ProcessoDaPauta {
  const linhas = bloco.texto.split('\n').map((linha) => linha.trim())
  const linhaVara = campoSimples(bloco.texto, 'Vara')
  const { vara, comarca } = separarVaraComarca(linhaVara, campoSimples(bloco.texto, 'Cidade'))
  const sistema = identificarSistema(numeroCnj, linhaVara)
  if (linhaVara === null) {
    avisos.push(`Publicação ${bloco.numero} (${numeroCnj}): sem linha "Vara:", sistema pelo 1º dígito.`)
  }
  if (sistema === null) {
    avisos.push(`Publicação ${bloco.numero} (${numeroCnj}): sistema não identificado, revisar à mão.`)
  }
  return {
    numeroCnj,
    numeroPublicacao: bloco.numero,
    publicacoes: [bloco.numero],
    vara,
    comarca,
    poloAtivo: juntar(valoresDoCampo(linhas, 'POLO ATIVO:')),
    poloPassivo: juntar(valoresDoCampo(linhas, 'POLO PASSIVO:')),
    classeProcessual: extrairClasse(bloco.texto, numeroCnj),
    sistema,
    observacoes: null,
  }
}

// O último bloco manda (regra do Cowork), mas campo que ele não trouxe herda do anterior.
function mesclar(anterior: ProcessoDaPauta, atual: ProcessoDaPauta): ProcessoDaPauta {
  const publicacoes = [...anterior.publicacoes, ...atual.publicacoes]
  return {
    numeroCnj: atual.numeroCnj,
    numeroPublicacao: atual.numeroPublicacao,
    publicacoes,
    vara: atual.vara ?? anterior.vara,
    comarca: atual.comarca ?? anterior.comarca,
    poloAtivo: atual.poloAtivo ?? anterior.poloAtivo,
    poloPassivo: atual.poloPassivo ?? anterior.poloPassivo,
    classeProcessual: atual.classeProcessual ?? anterior.classeProcessual,
    sistema: atual.sistema ?? anterior.sistema,
    observacoes: `Duplicado na pauta: ${publicacoes.length}x, publicações ${publicacoes.join(', ')}`,
  }
}

function numeroCapturado(padrao: RegExp, texto: string): number | null {
  const achado = padrao.exec(texto)
  return achado ? Number(achado[1]) : null
}

function conferirTotal(origem: string, declarado: number | null, lidos: number, avisos: string[]): void {
  if (declarado === null) avisos.push(`Total de publicações não encontrado no ${origem}.`)
  else if (declarado !== lidos) avisos.push(`${lidos} blocos lidos, mas o ${origem} declara ${declarado}.`)
}

export function parsearPauta(assunto: string, corpoOriginal: string): ResultadoParser {
  const corpo = corpoOriginal.replace(/\r\n?/g, '\n')
  const blocos = dividirEmBlocos(corpo)
  const avisos: string[] = []
  const porCnj = new Map<string, ProcessoDaPauta>()
  let totalFint = 0
  let totalValidos = 0
  let totalSemCnj = 0

  for (const bloco of blocos) {
    const tribunal = campoSimples(bloco.texto, 'Tribunal')
    // FINT é expediente sem efeito de intimação: sai de todas as contagens, inclusive a de repetidos
    if (tribunal !== null && /^FINT\b/i.test(tribunal)) {
      totalFint++
      continue
    }
    const numeroCnj = PADRAO_CNJ.exec(bloco.texto)?.[0]
    if (!numeroCnj) {
      totalSemCnj++
      avisos.push(`Publicação ${bloco.numero}: sem número CNJ, pulada.`)
      continue
    }
    totalValidos++
    const processo = lerProcesso(bloco, numeroCnj, avisos)
    const anterior = porCnj.get(numeroCnj)
    porCnj.set(numeroCnj, anterior ? mesclar(anterior, processo) : processo)
  }

  const totalDeclaradoCorpo = numeroCapturado(/Total de Publica[çc][õo]es:\s*(\d+)/i, corpo)
  const totalDeclaradoAssunto = numeroCapturado(/total\s+(\d+)\s+publica/i, assunto)
  conferirTotal('corpo', totalDeclaradoCorpo, blocos.length, avisos)
  conferirTotal('assunto', totalDeclaradoAssunto, blocos.length, avisos)

  const processos = [...porCnj.values()].sort((a, b) => a.numeroPublicacao - b.numeroPublicacao)
  const totaisBatem = totalDeclaradoCorpo === blocos.length && totalDeclaradoAssunto === blocos.length
  const esperavaPublicacao = blocos.length > 0 || (totalDeclaradoCorpo ?? 0) > 0 || (totalDeclaradoAssunto ?? 0) > 0
  const soFint = totalValidos === 0 && blocos.length > 0 && totalFint === blocos.length
  const status: StatusParser =
    processos.length === 0 && esperavaPublicacao && !soFint ? 'sem_cnj' : totaisBatem ? 'ok' : 'divergente'

  return {
    loteId: extrairLoteId(assunto),
    totalBlocos: blocos.length,
    totalFint,
    totalValidos,
    totalSemCnj,
    totalDeclaradoCorpo,
    totalDeclaradoAssunto,
    processos,
    avisos,
    status,
  }
}
