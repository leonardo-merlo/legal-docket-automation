// O vocabulário do feedback que o Rafael dá sobre cada rascunho da IA.
//
// Existe para uma coisa só: no fim do mês, poder responder "em que a IA erra
// mais?" com um número em vez de uma impressão. Por isso os motivos são uma
// lista fechada — motivo escrito livre não agrupa, e o que não agrupa não vira
// correção de prompt.

export const MOTIVOS = [
  { value: 'status', label: 'Status sugerido' },
  { value: 'responsavel', label: 'Responsável' },
  { value: 'prazo_fatal', label: 'Prazo fatal' },
  { value: 'prazo_interno', label: 'Prazo interno' },
  { value: 'cenario_prazo', label: 'Prazo não estava explícito' },
  { value: 'proxima_acao', label: 'Texto da próxima ação' },
  { value: 'justificativa', label: 'Justificativa / fundamentação' },
  { value: 'alerta', label: 'Alerta / pontos de atenção' },
  { value: 'checklist', label: 'Passo a passo' },
  { value: 'outro', label: 'Outro' },
] as const

export type MotivoValue = (typeof MOTIVOS)[number]['value']

const MOTIVO_LABELS: Record<string, string> = Object.fromEntries(
  MOTIVOS.map((m) => [m.value, m.label])
)

export function motivoLabel(motivo: string): string {
  return MOTIVO_LABELS[motivo] ?? motivo
}

/**
 * De que campo do rascunho veio a edição. A edição do Rafael já é um motivo
 * pronto: ele mexeu no prazo fatal, então o prazo fatal foi o problema. Mapear
 * campo → motivo evita pedir a ele um formulário que a própria edição responde.
 */
const CAMPO_PARA_MOTIVO: Record<string, MotivoValue> = {
  status_sugerido: 'status',
  responsavel_sugerido_id: 'responsavel',
  prazo_fatal_dias_uteis: 'prazo_fatal',
  prazo_interno_dias_uteis: 'prazo_interno',
  proxima_acao: 'proxima_acao',
  justificativa: 'justificativa',
  alerta: 'alerta',
  checklist: 'checklist',
}

export function motivosDosCampos(campos: string[]): string[] {
  const motivos = campos.map((c) => CAMPO_PARA_MOTIVO[c]).filter(Boolean)
  return Array.from(new Set(motivos))
}

/**
 * Valores que um campo de rascunho pode ter. Fechado assim, e não `unknown`,
 * porque a coluna é jsonb e precisa aceitar o valor sem conversão.
 */
export type ValorCampo = string | number | boolean | null | string[]

/** Uma alteração registrada no histórico: o que a IA disse e o que virou. */
export type Alteracao = {
  campo: string
  antes: ValorCampo
  depois: ValorCampo
}

export const ACOES = ['aprovado', 'editado', 'rejeitado'] as const
export type Acao = (typeof ACOES)[number]
