// Vocabulário de status e risco, em um lugar só.
//
// Estes rótulos estavam copiados em três telas, e duas delas conheciam apenas 5
// dos 21 status — o que fazia um processo de apelação aparecer escrito
// "AGRAVO_INSTRUMENTO" na cara do usuário. Quem adicionar um status novo mexe
// aqui, no CHECK do banco e em STATUS_SUGERIDOS do analyzer.py.

export const STATUS_OPTIONS = [
  { value: 'CONTESTACAO', label: 'Contestação' },
  { value: 'SENTENCA_ACORDO', label: 'Sentença / Acordo' },
  { value: 'EXECUCAO', label: 'Execução' },
  { value: 'AGUARDAR', label: 'Aguardar' },
  { value: 'MANIFESTAR', label: 'Manifestar' },
  { value: 'APELACAO', label: 'Apelação' },
  { value: 'AGRAVO_INSTRUMENTO', label: 'Agravo de Instrumento' },
  { value: 'EMBARGOS_DECLARACAO', label: 'Embargos de Declaração' },
  { value: 'RECURSO_ESPECIAL', label: 'Recurso Especial' },
  { value: 'RECURSO_EXTRAORDINARIO', label: 'Recurso Extraordinário' },
  { value: 'CONTRARRAZOES', label: 'Contrarrazões' },
  { value: 'CONTRARRAZOES_RECURSO_ADESIVO', label: 'Contrarrazões e Recurso Adesivo' },
  { value: 'PETICAO', label: 'Petição' },
  { value: 'PETICAO_PROVAS', label: 'Petição Provas' },
  { value: 'COMPROVAR_HIPOSSUFICIENCIA', label: 'Comprovar hipossuficiência' },
  { value: 'EMENDA_INICIAL', label: 'Emenda à Inicial' },
  { value: 'JUNTAR_DOCUMENTOS', label: 'Juntar documentação' },
  { value: 'CUMPRIMENTO_SENTENCA', label: 'Cumprimento de Sentença' },
  { value: 'CIENCIA', label: 'Ciência' },
  { value: 'ALEGACOES_FINAIS', label: 'Alegações Finais' },
  { value: 'REPLICA', label: 'Réplica' },
] as const

const LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label])
)

// Estados de ciclo de vida do processo. Não vêm da IA, mas aparecem em
// processos.status_atual e precisam de rótulo igual aos outros.
const LABELS_CICLO_VIDA: Record<string, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  ARQUIVADO: 'Arquivado',
}

/** Nunca devolve vazio: um status desconhecido aparece cru, e não some da tela. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return LABELS[status] ?? LABELS_CICLO_VIDA[status] ?? status
}

// Estado do processo na esteira do robô. Estava copiado em quatro telas
// (ProcessoCard, ProcessosList, a página do processo e a do e-mail), cada uma
// conhecendo um subconjunto diferente — a lista da entrada sabia 'ignorado' e
// não sabia 'erro_classificacao'; as outras, o contrário. Um status novo
// aparecia cru em três lugares e ninguém percebia.
export const PJE_STATUS_TRATADO_MANUAL = 'tratado_manual'

export const PJE_STATUS_INFO: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  pendente: { label: 'Pendente', className: 'bg-amber-100 text-amber-800', dot: 'bg-amber-400' },
  processado: { label: 'Processado', className: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
  ignorado: { label: 'Ignorado', className: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
  erro_browser: { label: 'Erro browser', className: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  captcha_bloqueado: { label: 'CAPTCHA', className: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
  erro_classificacao: { label: 'Erro classificação', className: 'bg-orange-100 text-orange-800', dot: 'bg-orange-400' },
  // Assumido pelo gestor: saiu da fila do robô e quem edita é ele. Cor própria
  // de propósito — não é sucesso do robô nem erro, e confundir com um dos dois
  // faria o painel contar errado.
  [PJE_STATUS_TRATADO_MANUAL]: {
    label: 'Tratado na mão',
    className: 'bg-sky-100 text-sky-800',
    dot: 'bg-sky-500',
  },
  // Só existe em `publicacoes`: saiu de novo na pauta antes de ser tentada.
  // Normalmente a tela mostra o estado da publicação seguinte no lugar deste.
  substituida: { label: 'Substituída', className: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
}

/** `null` para status desconhecido — a tela decide se mostra algo no lugar. */
export function pjeStatusInfo(status: string | null | undefined) {
  if (!status) return null
  return PJE_STATUS_INFO[status] ?? null
}

/**
 * Este processo ainda é responsabilidade do robô?
 *
 * Espelha a fila do agente (`ler_cnjs_supabase` no runner.py), que busca
 * pendente, erro_browser e captcha_bloqueado. As duas pontas descrevem a mesma
 * fila e não podem discordar.
 */
export function estaNaFilaDoRobo(status: string | null | undefined): boolean {
  return status === 'pendente' || status === 'erro_browser' || status === 'captcha_bloqueado'
}

export const RISCO_NIVEIS = ['CRITICO', 'ALTO', 'MEDIO', 'BAIXO'] as const
export type RiscoNivel = (typeof RISCO_NIVEIS)[number]

const RISCO_LABELS: Record<string, string> = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Médio',
  BAIXO: 'Baixo',
}

export function riscoLabel(risco: string | null | undefined): string {
  if (!risco) return '—'
  return RISCO_LABELS[risco] ?? risco
}

export const RISCO_STYLE: Record<string, string> = {
  CRITICO: 'bg-red-100 text-red-800',
  ALTO: 'bg-orange-100 text-orange-800',
  MEDIO: 'bg-yellow-100 text-yellow-800',
  BAIXO: 'bg-green-100 text-green-800',
}

/**
 * Peso para ordenar: do mais crítico para o menos. Sem risco vai para o fim —
 * processo sem análise não pode empurrar processo crítico para baixo.
 */
export function riscoPeso(risco: string | null | undefined): number {
  const i = RISCO_NIVEIS.indexOf(risco as RiscoNivel)
  return i === -1 ? RISCO_NIVEIS.length : i
}

export const CENARIO_PRAZO_LABEL: Record<string, string> = {
  EXPLICITO: 'Prazo explícito',
  VIA_ARTIGO: 'Prazo via artigo',
  INFERIDO: 'Prazo inferido',
}

/** Versão curta, para caber dentro de uma célula de tabela. */
export const CENARIO_PRAZO_CURTO: Record<string, string> = {
  EXPLICITO: 'explícito',
  VIA_ARTIGO: 'via artigo',
  INFERIDO: 'inferido',
}
