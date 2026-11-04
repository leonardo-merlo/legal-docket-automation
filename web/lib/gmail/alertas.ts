export type NivelAlerta = 'ok' | 'warn' | 'danger'

export interface Saude {
  nivel: NivelAlerta
  texto: string
}

export interface IntegracaoParaSaude {
  status: string
  ultima_sincronizacao_ok_em: string | null
  ultimo_erro: string | null
}

export interface EmailParaAlerta {
  id: string
  lote_id: string | null
  total_cnj: number | null
  total_blocos: number | null
  total_fint: number | null
  total_declarado: number | null
  total_declarado_assunto: number | null
  parser_status: string | null
  aplicacao_status: string | null
  erro: string | null
}

export interface Alerta {
  emailId: string
  nivel: Exclude<NivelAlerta, 'ok'>
  texto: string
}

// o cron roda a cada 15 min: uma hora sem rodada completa são quatro falhas seguidas
const MINUTOS_SEM_SINCRONIZAR = 60
// a OAB manda em dia útil; sexta de manhã até segunda de manhã são 3 dias
const DIAS_SEM_EMAIL = 3

function minutosDesde(iso: string, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000)
}

export function descreverTempo(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return `${horas} h`
  return `${Math.floor(horas / 24)} dias`
}

export function saudeDaSincronizacao(integracao: IntegracaoParaSaude | null, agora: Date): Saude {
  if (!integracao) return { nivel: 'danger', texto: 'Gmail não conectado.' }
  if (integracao.status !== 'conectado') {
    return { nivel: 'danger', texto: 'Gmail desconectado: senha trocada ou acesso revogado. Clique em Reconectar.' }
  }
  if (!integracao.ultima_sincronizacao_ok_em) {
    return { nivel: 'warn', texto: 'Conectado, aguardando a primeira sincronização.' }
  }
  const minutos = minutosDesde(integracao.ultima_sincronizacao_ok_em, agora)
  if (minutos > MINUTOS_SEM_SINCRONIZAR) return { nivel: 'danger', texto: `Sem sincronizar há ${descreverTempo(minutos)}.` }
  if (integracao.ultimo_erro) {
    return { nivel: 'warn', texto: `Sincronizou há ${descreverTempo(minutos)}, com erro: ${integracao.ultimo_erro}` }
  }
  return { nivel: 'ok', texto: `Sincronizado há ${descreverTempo(minutos)}.` }
}

export function alertaDoUltimoEmail(dataRecebimento: string | null, agora: Date): Saude {
  if (!dataRecebimento) return { nivel: 'warn', texto: 'Nenhum e-mail da OAB lido ainda.' }
  const minutos = minutosDesde(dataRecebimento, agora)
  return {
    nivel: minutos > DIAS_SEM_EMAIL * 24 * 60 ? 'warn' : 'ok',
    texto: `Último e-mail da OAB há ${descreverTempo(minutos)}.`,
  }
}

export function alertasDoEmail(email: EmailParaAlerta): Alerta[] {
  const pauta = email.lote_id ? `Pauta ${email.lote_id}` : 'E-mail sem data de pauta'
  const alertas: Alerta[] = []
  const alertar = (nivel: Alerta['nivel'], texto: string) => alertas.push({ emailId: email.id, nivel, texto: `${pauta}: ${texto}` })

  if (email.parser_status === 'erro') {
    alertar('danger', email.erro ?? 'não foi possível ler o e-mail.')
    return alertas
  }
  if (email.parser_status === 'sem_cnj') {
    alertar('danger', `nenhum CNJ lido (${email.total_blocos ?? 0} blocos, ${email.total_fint ?? 0} FINT).`)
  }
  const blocos = email.total_blocos ?? 0
  const declarados = [email.total_declarado, email.total_declarado_assunto]
  if (declarados.some((declarado) => declarado !== blocos)) {
    alertar('warn', `${blocos} blocos lidos, o e-mail declara ${declarados.map((d) => d ?? '?').join(' / ')}.`)
  }
  if (!email.lote_id) {
    alertar('danger', 'o assunto não traz a data; não será gravado nos processos.')
  }
  if (email.aplicacao_status === 'remetente_nao_autenticado') {
    alertar('danger', 'remetente não autenticado; não foi gravado nos processos.')
  } else if (email.erro?.startsWith('Remetente não autenticado') || email.erro?.includes(' Remetente não autenticado')) {
    // em sombra nada é gravado, mas é aqui que se vê se a trava barraria a pauta real
    alertar('warn', 'remetente não autenticado; no modo ativo não seria gravado.')
  }
  if (email.aplicacao_status === 'pauta_repetida') {
    alertar('warn', 'pauta repetida; não foi gravada de novo. Confira se é igual à primeira.')
  }
  if (email.aplicacao_status === 'erro_aplicacao') {
    alertar('danger', `falhou ao gravar nos processos (${email.erro ?? 'sem detalhe'}); a próxima sincronização tenta de novo.`)
  }
  return alertas
}
