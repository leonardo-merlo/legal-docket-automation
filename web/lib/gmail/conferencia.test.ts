import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { acertoDaLeitura } from './conferencia.ts'

describe('acerto da leitura do e-mail', () => {
  test('soma os processos dos e-mails conferidos e desconta os errados', () => {
    const acerto = acertoDaLeitura([
      { total_cnj: 17, conferencia_status: 'ok', conferencia_processos_errados: null },
      { total_cnj: 3, conferencia_status: 'com_erro', conferencia_processos_errados: 1 },
    ])
    assert.deepEqual([acerto.certos, acerto.total, acerto.emailsConferidos], [19, 20, 2])
  })

  test('ignora e-mail ainda não conferido', () => {
    const acerto = acertoDaLeitura([{ total_cnj: 30, conferencia_status: null, conferencia_processos_errados: null }])
    assert.equal(acerto.percentual, null)
  })

  test('errados acima do total contam como o total', () => {
    const acerto = acertoDaLeitura([{ total_cnj: 2, conferencia_status: 'com_erro', conferencia_processos_errados: 5 }])
    assert.equal(acerto.percentual, 0)
  })
})
