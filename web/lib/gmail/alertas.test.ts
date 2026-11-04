import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { alertaDoUltimoEmail, alertasDoEmail, saudeDaSincronizacao, type EmailParaAlerta } from './alertas.ts'

const AGORA = new Date('2026-09-10T12:00:00Z')
const minutosAtras = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000).toISOString()

function email(campos: Partial<EmailParaAlerta> = {}): EmailParaAlerta {
  return {
    id: 'email-1',
    lote_id: '09/09/2026',
    total_cnj: 10,
    total_blocos: 12,
    total_fint: 2,
    total_declarado: 12,
    total_declarado_assunto: 12,
    parser_status: 'ok',
    aplicacao_status: 'sombra',
    erro: null,
    ...campos,
  }
}

describe('saúde da sincronização', () => {
  test('sem integração é perigo', () => {
    assert.equal(saudeDaSincronizacao(null, AGORA).nivel, 'danger')
  })

  test('desconectado pede para reconectar', () => {
    const saude = saudeDaSincronizacao({ status: 'desconectado', ultima_sincronizacao_ok_em: minutosAtras(5), ultimo_erro: null }, AGORA)
    assert.equal(saude.nivel, 'danger')
    assert.ok(saude.texto.includes('Reconectar'))
  })

  test('mais de 60 minutos sem rodada completa é perigo', () => {
    assert.equal(saudeDaSincronizacao({ status: 'conectado', ultima_sincronizacao_ok_em: minutosAtras(61), ultimo_erro: null }, AGORA).nivel, 'danger')
  })

  test('rodada recente sem erro está ok', () => {
    const saude = saudeDaSincronizacao({ status: 'conectado', ultima_sincronizacao_ok_em: minutosAtras(10), ultimo_erro: null }, AGORA)
    assert.deepEqual(saude, { nivel: 'ok', texto: 'Sincronizado há 10 min.' })
  })

  test('rodada recente com erro em alguma mensagem é atenção', () => {
    assert.equal(saudeDaSincronizacao({ status: 'conectado', ultima_sincronizacao_ok_em: minutosAtras(10), ultimo_erro: 'x' }, AGORA).nivel, 'warn')
  })
})

describe('último e-mail da OAB', () => {
  test('até 3 dias está ok', () => {
    assert.equal(alertaDoUltimoEmail(minutosAtras(2 * 24 * 60), AGORA).nivel, 'ok')
  })

  test('mais de 3 dias é atenção', () => {
    assert.equal(alertaDoUltimoEmail(minutosAtras(4 * 24 * 60), AGORA).nivel, 'warn')
  })
})

describe('alertas por e-mail', () => {
  test('e-mail que fechou não gera alerta', () => {
    assert.deepEqual(alertasDoEmail(email()), [])
  })

  test('parser com 0 CNJ é perigo e mostra quantos FINT', () => {
    const [alerta] = alertasDoEmail(email({ parser_status: 'sem_cnj', total_cnj: 0 }))
    assert.equal(alerta.nivel, 'danger')
    assert.equal(alerta.texto, 'Pauta 09/09/2026: nenhum CNJ lido (12 blocos, 2 FINT).')
  })

  test('blocos diferentes do total declarado é atenção', () => {
    const [alerta] = alertasDoEmail(email({ parser_status: 'divergente', total_blocos: 11 }))
    assert.equal(alerta.nivel, 'warn')
    assert.equal(alerta.texto, 'Pauta 09/09/2026: 11 blocos lidos, o e-mail declara 12 / 12.')
  })

  test('falha ao gravar nos processos é perigo', () => {
    const alertas = alertasDoEmail(email({ aplicacao_status: 'erro_aplicacao', erro: 'timeout' }))
    assert.equal(alertas[0]?.nivel, 'danger')
  })

  test('pauta sem data avisa que não será gravada', () => {
    const [alerta] = alertasDoEmail(email({ lote_id: null }))
    assert.equal(alerta?.texto, 'E-mail sem data de pauta: o assunto não traz a data; não será gravado nos processos.')
  })

  test('em sombra, remetente não autenticado vira atenção', () => {
    const [alerta] = alertasDoEmail(email({ erro: 'Remetente não autenticado: o Gmail não confirmou SPF, DKIM nem DMARC do domínio do remetente.' }))
    assert.equal(alerta?.nivel, 'warn')
  })

  test('pauta repetida avisa para conferir', () => {
    const [alerta] = alertasDoEmail(email({ aplicacao_status: 'pauta_repetida' }))
    assert.equal(alerta?.nivel, 'warn')
  })

  test('remetente não autenticado é perigo', () => {
    const [alerta] = alertasDoEmail(email({ aplicacao_status: 'remetente_nao_autenticado' }))
    assert.equal(alerta?.nivel, 'danger')
  })

  test('e-mail ilegível é perigo e não acusa divergência junto', () => {
    const alertas = alertasDoEmail(email({ parser_status: 'erro', erro: 'O e-mail não tem parte text/plain.', total_blocos: null }))
    assert.equal(alertas.length, 1)
  })
})
