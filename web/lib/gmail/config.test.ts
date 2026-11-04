import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { diasDaJanela, lerConfig, montarConsulta, remetenteAceito, REMETENTES_PADRAO } from './config.ts'

describe('modo da ingestão', () => {
  test('fica em sombra quando nada está configurado', () => {
    assert.equal(lerConfig({}).modo, 'sombra')
  })

  test('fica em sombra quando pede ativo sem data de corte', () => {
    assert.equal(lerConfig({ GMAIL_INGESTAO_MODO: 'ativo' }).modo, 'sombra')
  })

  test('ativa com modo ativo e corte em DD/MM/AAAA', () => {
    const config = lerConfig({ GMAIL_INGESTAO_MODO: 'ativo', GMAIL_LOTE_CORTE: '08/09/2026' })
    assert.equal(config.modo, 'ativo')
    assert.equal(config.loteCorte, '08/09/2026')
  })
})

describe('remetentes', () => {
  test('usa os dois remetentes padrão', () => {
    assert.deepEqual(lerConfig({}).remetentes, REMETENTES_PADRAO)
  })

  test('aceita lista própria, em minúsculas e sem espaços', () => {
    assert.deepEqual(lerConfig({ GMAIL_REMETENTES: ' A@x.com , b@y.com ' }).remetentes, ['a@x.com', 'b@y.com'])
  })

  test('aceita o From com nome e maiúsculas', () => {
    assert.equal(remetenteAceito('Intimações <Intimacoes@exemplo-adv.example>', REMETENTES_PADRAO), true)
  })

  test('recusa remetente de fora e From ausente', () => {
    assert.equal(remetenteAceito('alguem@outro.com', REMETENTES_PADRAO), false)
    assert.equal(remetenteAceito(null, REMETENTES_PADRAO), false)
  })
})

describe('busca no Gmail', () => {
  test('filtra remetentes, assunto do Recorte Digital e janela em dias', () => {
    assert.equal(
      montarConsulta(['a@x.com', 'b@y.com'], 7),
      'from:(a@x.com OR b@y.com) subject:"Recorte Digital" newer_than:7d',
    )
  })

  test('olha 7 dias normalmente e 60 na primeira sincronização', () => {
    const config = lerConfig({})
    assert.deepEqual([config.janelaDias, config.janelaPrimeiraSincronizacaoDias], [7, 60])
  })
})

describe('janela da busca', () => {
  const config = lerConfig({})
  const agora = new Date('2026-10-08T12:00:00.000Z')

  test('usa a janela da primeira sincronização quando nunca houve rodada completa', () => {
    assert.equal(diasDaJanela(null, agora, config), 60)
  })

  test('usa a janela normal quando a última rodada completa foi recente', () => {
    assert.equal(diasDaJanela('2026-10-07T12:00:00.000Z', agora, config), 7)
  })

  test('alarga a janela para cobrir desde a última rodada completa, com um dia de folga', () => {
    assert.equal(diasDaJanela('2026-09-28T12:00:00.000Z', agora, config), 11)
  })

  test('arredonda para cima a fração de dia', () => {
    assert.equal(diasDaJanela('2026-09-28T13:00:00.000Z', agora, config), 11)
    assert.equal(diasDaJanela('2026-09-28T11:00:00.000Z', agora, config), 12)
  })
})
