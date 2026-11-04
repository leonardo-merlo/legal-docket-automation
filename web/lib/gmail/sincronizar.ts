// Uma rodada da ingestão: renova o token, lista as pautas no Gmail, lê as mensagens
// novas, roda o parser e grava. Em modo sombra para em emails_recebidos; em modo
// ativo aplica em processos. Chamado pelo pg_cron (via rota) e pelo botão do painel.
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/types'
import { decifrar } from '@/lib/gmail/cripto'
import { diasDaJanela, lerConfig, montarConsulta, remetenteAceito, type ConfigIngestao, type ModoIngestao } from '@/lib/gmail/config'
import { AcessoRevogadoError, lerMensagem, listarIdsDeMensagens, renovarAccessToken } from '@/lib/gmail/google'
import { decidirGravacao, loteDepoisDoCorte, type Gravacao } from '@/lib/gmail/gravacao'
import { chaveDoToken } from '@/lib/gmail/integracao'
import { remetenteAutenticado } from '@/lib/gmail/autenticacao'
import { desembaralharAcentos, extrairTextoPlano, lerHeader } from '@/lib/gmail/mime'
import { parsearPauta, VERSAO_PARSER, type ResultadoParser } from '@/lib/gmail/parser'

type Admin = ReturnType<typeof createAdminClient>

// cabe folgado em 60 s: cada mensagem é um GET no Gmail e poucas escritas no banco
const MAX_MENSAGENS_POR_RODADA = 25
const MAX_REPARACOES_POR_RODADA = 5

export interface ResumoSincronizacao {
  status: 'ok' | 'nao_conectado' | 'desconectado' | 'erro'
  modo: ModoIngestao
  encontrados: number
  novos: number
  ignoradosRemetente: number
  aplicados: number
  erros: string[]
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

export async function sincronizarGmail(opcoes: { aplicarEmailIds?: string[] } = {}): Promise<ResumoSincronizacao> {
  const config = lerConfig(process.env)
  const supabase = createAdminClient()
  const resumo: ResumoSincronizacao = {
    status: 'ok',
    modo: config.modo,
    encontrados: 0,
    novos: 0,
    ignoradosRemetente: 0,
    aplicados: 0,
    erros: [],
  }

  const { data: integracao, error: erroIntegracao } = await supabase
    .from('integracao_gmail')
    .select('refresh_token_cifrado, status, ultima_sincronizacao_ok_em')
    .eq('id', 1)
    .maybeSingle()
  if (erroIntegracao) throw new Error(`Erro ao ler a integração do Gmail: ${erroIntegracao.message}`)
  if (!integracao) return { ...resumo, status: 'nao_conectado' }
  if (integracao.status !== 'conectado') return { ...resumo, status: 'desconectado' }

  const inicio = new Date().toISOString()
  try {
    const accessToken = await renovarAccessToken(decifrar(integracao.refresh_token_cifrado, chaveDoToken()))

    if (config.modo === 'ativo') {
      resumo.aplicados += await repararAplicacoes(supabase, resumo)
    }

    const dias = diasDaJanela(integracao.ultima_sincronizacao_ok_em, new Date(inicio), config)
    const ids = await listarIdsDeMensagens(accessToken, montarConsulta(config.remetentes, dias))
    resumo.encontrados = ids.length
    const jaSalvos = await idsJaSalvos(supabase, ids)
    // o Gmail lista da mais nova para a mais antiga; gravar na ordem das pautas
    const naoSalvos = ids.filter((id) => !jaSalvos.has(id)).reverse()
    const novos = naoSalvos.slice(0, MAX_MENSAGENS_POR_RODADA)
    for (const id of novos) {
      try {
        resumo.aplicados += await processarMensagem(supabase, accessToken, id, config, resumo)
      } catch (erro) {
        resumo.erros.push(`Mensagem ${id}: ${mensagemDe(erro)}`)
      }
    }

    const pedidos = opcoes.aplicarEmailIds ?? []
    if (pedidos.length > 0 && config.modo !== 'ativo') {
      resumo.erros.push('aplicar_email_ids ignorado: a ingestão está em modo sombra.')
    }
    if (config.modo === 'ativo') {
      for (const emailId of pedidos) {
        try {
          resumo.aplicados += await aplicarEmail(supabase, emailId)
        } catch (erro) {
          resumo.erros.push(`E-mail ${emailId}: ${mensagemDe(erro)}`)
        }
      }
    }

    const temErro = resumo.erros.length > 0
    // só marca a rodada como completa se leu tudo o que havia: senão a próxima perderia
    // a janela larga e as mensagens que ficaram para trás sairiam da busca
    const leuTudo = naoSalvos.length <= MAX_MENSAGENS_POR_RODADA && !temErro
    const { error: erroFim } = await supabase
      .from('integracao_gmail')
      .update({
        ultima_sincronizacao_em: inicio,
        ...(leuTudo ? { ultima_sincronizacao_ok_em: inicio } : {}),
        ultimo_erro: temErro ? resumo.erros.join(' | ').slice(0, 1000) : null,
        ultimo_erro_em: temErro ? inicio : null,
        atualizado_em: inicio,
      })
      .eq('id', 1)
    if (erroFim) throw new Error(`Erro ao registrar o fim da rodada: ${erroFim.message}`)
    return resumo
  } catch (erro) {
    const revogado = erro instanceof AcessoRevogadoError
    await supabase
      .from('integracao_gmail')
      .update({
        ...(revogado ? { status: 'desconectado' } : {}),
        ultima_sincronizacao_em: inicio,
        ultimo_erro: mensagemDe(erro).slice(0, 1000),
        ultimo_erro_em: inicio,
        atualizado_em: inicio,
      })
      .eq('id', 1)
    return { ...resumo, status: revogado ? 'desconectado' : 'erro', erros: [...resumo.erros, mensagemDe(erro)] }
  }
}

async function idsJaSalvos(supabase: Admin, ids: string[]): Promise<Set<string>> {
  const salvos = new Set<string>()
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const { data, error } = await supabase
      .from('emails_recebidos')
      .select('gmail_message_id')
      .in('gmail_message_id', ids.slice(inicio, inicio + 100))
    if (error) throw new Error(`Erro ao conferir mensagens já lidas: ${error.message}`)
    for (const linha of data ?? []) if (linha.gmail_message_id) salvos.add(linha.gmail_message_id)
  }
  return salvos
}

async function processarMensagem(
  supabase: Admin,
  accessToken: string,
  id: string,
  config: ConfigIngestao,
  resumo: ResumoSincronizacao,
): Promise<number> {
  const mensagem = await lerMensagem(accessToken, id)
  const remetente = lerHeader(mensagem.payload, 'From')
  // a busca já filtra o remetente; conferir de novo protege contra o from: do Gmail casar parcial
  if (!remetenteAceito(remetente, config.remetentes)) {
    resumo.ignoradosRemetente++
    return 0
  }
  const assunto = lerHeader(mensagem.payload, 'Subject') ?? ''
  const texto = extrairTextoPlano(mensagem.payload)
  const resultado: ResultadoParser | null = texto ? parsearPauta(assunto, desembaralharAcentos(texto.texto)) : null
  // confere também em sombra: é ali que se vê se a trava deixa passar as pautas reais
  const autenticado = remetenteAutenticado(mensagem.payload.headers, remetente)
  const aplicacao = await decidirAplicacao(supabase, config, resultado?.loteId ?? null, autenticado)
  const erro = [
    texto ? null : 'O e-mail não tem parte text/plain.',
    autenticado ? null : MENSAGEM_NAO_AUTENTICADO,
  ].filter(Boolean).join(' ') || null

  const { data: salvo, error } = await supabase
    .from('emails_recebidos')
    .insert({
      remetente: remetente ?? '',
      assunto,
      data_recebimento: new Date(Number(mensagem.internalDate)).toISOString(),
      data_processamento: new Date().toISOString(),
      gmail_message_id: id,
      corpo_texto: texto?.texto ?? null,
      lote_id: resultado?.loteId ?? null,
      total_cnj: resultado?.processos.length ?? 0,
      total_blocos: resultado?.totalBlocos ?? null,
      total_fint: resultado?.totalFint ?? null,
      total_validos: resultado?.totalValidos ?? null,
      total_declarado: resultado?.totalDeclaradoCorpo ?? null,
      total_declarado_assunto: resultado?.totalDeclaradoAssunto ?? null,
      parser_status: resultado?.status ?? 'erro',
      parser_versao: VERSAO_PARSER,
      parser_resultado: resultado ? (resultado as unknown as Json) : null,
      modo: config.modo,
      aplicacao_status: aplicacao,
      erro,
    })
    .select('id')
    .single()
  if (error) {
    // outra rodada salvou esta mensagem ao mesmo tempo (índice único em gmail_message_id)
    if (error.code === '23505') return 0
    throw new Error(`Erro ao salvar o e-mail: ${error.message}`)
  }
  resumo.novos++
  return aplicacao === 'pendente' ? aplicarEmail(supabase, salvo.id) : 0
}

// Gravada em `erro` também em sombra: é por ela que a aplicação manual de uma pauta
// lida em sombra sabe que o remetente não passou.
const MENSAGEM_NAO_AUTENTICADO = 'Remetente não autenticado: o Gmail não confirmou SPF, DKIM nem DMARC do domínio do remetente.'

type Aplicacao = 'sombra' | 'antes_do_corte' | 'pendente' | 'remetente_nao_autenticado' | 'pauta_repetida'

async function decidirAplicacao(
  supabase: Admin,
  config: ConfigIngestao,
  loteId: string | null,
  autenticado: boolean,
): Promise<Aplicacao> {
  if (config.modo === 'sombra') return 'sombra'
  if (!autenticado) return 'remetente_nao_autenticado'
  if (!loteDepoisDoCorte(loteId, config.loteCorte ?? '')) return 'antes_do_corte'
  // a mesma pauta pode chegar duas vezes (original e encaminhada, ou reenviada): a
  // segunda devolveria para a fila processos que já foram analisados. Só conta a
  // primeira que leu algum CNJ: senão um reenvio bom de uma pauta mal lida ficaria
  // parado para sempre.
  const { data, error } = await supabase
    .from('emails_recebidos')
    .select('id')
    .eq('lote_id', loteId ?? '')
    .in('aplicacao_status', ['pendente', 'aplicado', 'erro_aplicacao'])
    .gt('total_cnj', 0)
    .limit(1)
  if (error) throw new Error(`Erro ao conferir pauta repetida: ${error.message}`)
  return data && data.length > 0 ? 'pauta_repetida' : 'pendente'
}

// Salvar o e-mail e gravar os processos são passos separados. Se o segundo falhar, o
// e-mail já está no banco e a busca nunca mais o traz como novo: sem esta reparação,
// a pauta ficaria para trás em silêncio.
async function repararAplicacoes(supabase: Admin, resumo: ResumoSincronizacao): Promise<number> {
  const { data, error } = await supabase
    .from('emails_recebidos')
    .select('id')
    .eq('modo', 'ativo')
    .in('aplicacao_status', ['pendente', 'erro_aplicacao'])
    .order('data_recebimento', { ascending: true })
    .limit(MAX_REPARACOES_POR_RODADA)
  if (error) throw new Error(`Erro ao buscar pautas por reaplicar: ${error.message}`)
  let aplicados = 0
  for (const { id } of data ?? []) {
    try {
      aplicados += await aplicarEmail(supabase, id)
    } catch (erro) {
      resumo.erros.push(`E-mail ${id}: ${mensagemDe(erro)}`)
    }
  }
  return aplicados
}

async function aplicarEmail(supabase: Admin, emailId: string): Promise<number> {
  const { data: email, error } = await supabase
    .from('emails_recebidos')
    .select('id, lote_id, parser_resultado, aplicacao_status, erro')
    .eq('id', emailId)
    .single()
  if (error || !email) throw new Error(`E-mail ${emailId} não encontrado.`)
  // aplicar de novo devolveria para a fila processos que já foram analisados; e a
  // pauta lida em sombra só passa se o remetente foi autenticado naquela leitura
  const aplicavel = ['pendente', 'erro_aplicacao', 'sombra']
  if (!aplicavel.includes(email.aplicacao_status ?? '')) {
    throw new Error(`não pode ser gravado (situação: ${email.aplicacao_status ?? 'desconhecida'}).`)
  }
  if (email.erro?.includes(MENSAGEM_NAO_AUTENTICADO)) throw new Error('o remetente não foi autenticado.')
  const processos = (email.parser_resultado as unknown as ResultadoParser | null)?.processos ?? []

  try {
    if (processos.length > 0) {
      const { data: existentes, error: erroExistentes } = await supabase
        .from('processos')
        .select('numero_cnj, pje_status, observacoes')
        .in('numero_cnj', processos.map((processo) => processo.numeroCnj))
      if (erroExistentes) throw new Error(erroExistentes.message)
      const porCnj = new Map((existentes ?? []).map((linha) => [linha.numero_cnj, linha]))
      for (const processo of processos) {
        const gravacao = decidirGravacao(processo, porCnj.get(processo.numeroCnj), { loteId: email.lote_id, emailId })
        await executarGravacao(supabase, processo.numeroCnj, gravacao)
      }
    }
    const { error: erroMarcacao } = await supabase
      .from('emails_recebidos')
      .update({ aplicacao_status: 'aplicado', aplicado_em: new Date().toISOString(), erro: null })
      .eq('id', emailId)
    // os processos já foram gravados; o catch abaixo marca erro_aplicacao e a próxima
    // rodada grava de novo (só não fica calado). Evitar isso pede gravar os CNJs e a
    // marcação numa transação só — anotado em docs/divida-tecnica.md
    if (erroMarcacao) throw new Error(`processos gravados, mas a pauta não foi marcada como aplicada: ${erroMarcacao.message}`)
    return processos.length
  } catch (erro) {
    await supabase
      .from('emails_recebidos')
      .update({ aplicacao_status: 'erro_aplicacao', erro: mensagemDe(erro).slice(0, 1000) })
      .eq('id', emailId)
    throw erro
  }
}

async function executarGravacao(supabase: Admin, numeroCnj: string, gravacao: Gravacao): Promise<void> {
  if (gravacao.tipo === 'avisar_tratado_manual') {
    const { error } = await supabase.from('processos').update({ observacoes: gravacao.observacoes }).eq('numero_cnj', numeroCnj)
    if (error) throw new Error(`${numeroCnj}: ${error.message}`)
    return
  }
  if (gravacao.tipo === 'inserir') {
    const { error } = await supabase.from('processos').insert(gravacao.dados)
    if (!error) return
    if (error.code !== '23505') throw new Error(`${numeroCnj}: ${error.message}`)
    // o CNJ entrou entre a leitura e a gravação (o Cowork ainda roda na transição): atualiza
  }
  const { error } = await supabase.from('processos').update(gravacao.dados).eq('numero_cnj', numeroCnj)
  if (error) throw new Error(`${numeroCnj}: ${error.message}`)
}
