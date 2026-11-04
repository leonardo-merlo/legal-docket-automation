// Por que os processos não fecharam, do mais repetido para o menos.
//
// O agrupamento é por CATEGORIA, e não pelo texto cru de `motivo_ignorado`: as
// mensagens trazem o número do CNJ no meio ("Tabela de eventos não encontrada
// para 1566153-27...") e por isso duas ocorrências do mesmo problema nunca
// colidiriam. Um ranking em que tudo empata em 1 não é um ranking.

import { sistemaPeloNumero } from '@/lib/cnj'

/** Uma publicação que não fechou: o processo numa pauta, com o motivo daquele dia. */
export type LinhaMotivo = {
  /** id do processo, para o link */
  id: string
  numero_cnj: string
  pje_status: string | null
  motivo_ignorado: string | null
  /** Data da pauta, YYYY-MM-DD. */
  pauta: string
}

/** Um processo parado, como ele aparece na lista que abre ao clicar na categoria. */
export interface ProcessoComFalha {
  id: string
  numeroCnj: string
  /** Data da pauta em YYYY-MM-DD. `null` quando não dá para resolver. */
  data: string | null
  /** Sistema lido do NÚMERO do processo. */
  sistema: string
}

export interface MotivoErro {
  categoria: string
  total: number
  /** Um exemplo do texto original, para quem quiser conferir o que virou categoria. */
  exemplo: string
  /** Quais processos são. É o que o Rafael precisa para ir atrás deles. */
  processos: ProcessoComFalha[]
}

/**
 * Da mensagem crua para a categoria. Ordem importa: a primeira que casar vence,
 * então o específico vem antes do genérico.
 *
 * Os padrões saem das mensagens que o agente realmente grava — ver
 * runner.py (MOTIVO_*), pje_extractor.py, eproc_extractor.py e rupe_extractor.py
 * no repo do agente. Mexeu numa mensagem lá, confira aqui.
 */
const REGRAS: { padrao: RegExp; categoria: string }[] = [
  { padrao: /certificado digital|recusou o acesso/i, categoria: 'Exige certificado digital' },
  { padrao: /sistema não implementado/i, categoria: 'Sistema sem extrator' },
  {
    padrao: /não localizado|nenhum resultado na pesquisa|tabela de eventos não encontrada|sem_documentos|nenhuma_peca/i,
    categoria: 'Processo não encontrado',
  },
  // As três causas abaixo eram uma só até 31/08, e a mistura escondeu 35
  // processos do eProc que nunca chegaram a ser extraídos: todos apareciam como
  // "login não estava ativo", e o Rafael — que loga todo dia — não tinha o que
  // conferir. As ações são diferentes, então as categorias também são.
  //
  // A sessão que envelheceu na fila pede refazer o login DAQUELE sistema e rodar
  // de novo; o sistema fechado pede clicar em Abrir sistemas antes; e só o
  // terceiro caso é o login que de fato não foi feito. O específico vem antes do
  // genérico, como no resto desta lista.
  {
    padrao: /esperando a vez|envelheceu/i,
    categoria: 'Sessão expirou esperando a vez',
  },
  {
    padrao: /não estava aberto no chrome|nenhuma aba/i,
    categoria: 'Sistema não estava aberto',
  },
  {
    padrao: /sessão caiu|sessao_expirada|login ainda não estava feito|login não concluído/i,
    categoria: 'Login não estava ativo',
  },
  { padrao: /chrome parou de responder|conectar ao chrome|connect_over_cdp/i, categoria: 'Chrome não respondeu' },
  // MOTIVO_SISTEMA_TRAVOU, desde 08/10: a aba travou, o robô tentou recuperar e
  // não conseguiu, e só aquele sistema ficou para trás
  { padrao: /aba deste sistema travou/i, categoria: 'Aba do sistema travou' },
  { padrao: /análise não gerada/i, categoria: 'Análise da IA não saiu' },
  { padrao: /duplicad|já existe em processos/i, categoria: 'CNJ duplicado' },
  { padrao: /formato cnj inválido/i, categoria: 'Número em formato inválido' },
  { padrao: /supabase_falhou/i, categoria: 'Falha ao gravar no banco' },
]

const OUTROS = 'Outro motivo'

/** A categoria de uma mensagem. Função pura, exportada para poder ser conferida. */
export function categorizarMotivo(motivo: string): string {
  for (const { padrao, categoria } of REGRAS) {
    if (padrao.test(motivo)) return categoria
  }
  return OUTROS
}

/**
 * Ranking das categorias, com a quebra por sistema provável dentro de cada uma.
 *
 * O sistema sai do NÚMERO do processo, não da coluna `sistema` — essa guarda o
 * rótulo que veio do e-mail, que é justamente o que pode estar errado quando o
 * processo "não foi encontrado". Ver lib/cnj.ts.
 */
export function calcularMotivosErro(linhas: LinhaMotivo[]): MotivoErro[] {
  const porCategoria = new Map<
    string,
    { total: number; exemplo: string; processos: ProcessoComFalha[] }
  >()

  for (const linha of linhas) {
    const motivo = (linha.motivo_ignorado ?? '').trim()
    if (!motivo) continue

    const categoria = categorizarMotivo(motivo)
    const atual = porCategoria.get(categoria) ?? {
      total: 0,
      exemplo: motivo,
      processos: [] as ProcessoComFalha[],
    }
    atual.total++

    atual.processos.push({
      id: linha.id,
      numeroCnj: linha.numero_cnj,
      data: linha.pauta,
      sistema: sistemaPeloNumero(linha.numero_cnj).nome,
    })

    porCategoria.set(categoria, atual)
  }

  return Array.from(porCategoria.entries())
    .map(([categoria, dados]) => ({
      categoria,
      total: dados.total,
      exemplo: dados.exemplo,
      // mais recente primeiro: é o que ele provavelmente veio buscar
      processos: dados.processos.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '')),
    }))
    // desempate pelo nome para a ordem não dançar entre dois carregamentos
    .sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria))
}
