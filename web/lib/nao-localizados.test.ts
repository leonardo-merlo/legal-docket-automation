import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { resumirNaoLocalizados } from './nao-localizados.ts'

function processo(numeroCnj: string, roboDesistiuEm: string | null = null) {
  return { id: `id-${numeroCnj}`, numero_cnj: numeroCnj, vara: null, robo_desistiu_em: roboDesistiuEm }
}

describe('processos que o robô não acha no RUPE', () => {
  test('conta uma tentativa por rodada que voltou vazia', () => {
    const [resumo] = resumirNaoLocalizados([processo('A')], [
      { numero_cnj: 'A', momento: '2026-11-05T17:17:42Z' },
      { numero_cnj: 'A', momento: '2026-11-05T17:55:47Z' },
    ])
    assert.equal(resumo.tentativas, 2)
  })

  test('diz desde quando, pela tentativa mais antiga', () => {
    const [resumo] = resumirNaoLocalizados([processo('A')], [
      { numero_cnj: 'A', momento: '2026-11-05T17:55:47Z' },
      { numero_cnj: 'A', momento: '2026-10-02T15:00:00Z' },
    ])
    assert.equal(resumo.desde, '2026-10-02T15:00:00Z')
  })

  test('o mais travado vem primeiro', () => {
    const resumo = resumirNaoLocalizados([processo('A'), processo('B')], [
      { numero_cnj: 'B', momento: '2026-11-04T17:00:00Z' },
      { numero_cnj: 'B', momento: '2026-11-05T17:00:00Z' },
      { numero_cnj: 'A', momento: '2026-11-05T17:00:00Z' },
    ])
    assert.deepEqual(resumo.map((r) => r.numero_cnj), ['B', 'A'])
  })

  test('quem o robô desistiu de procurar vem antes de quem tem mais tentativas', () => {
    const resumo = resumirNaoLocalizados([processo('A'), processo('B', '2026-11-18T15:00:00Z')], [
      { numero_cnj: 'A', momento: '2026-11-04T17:00:00Z' },
      { numero_cnj: 'A', momento: '2026-11-05T17:00:00Z' },
      { numero_cnj: 'B', momento: '2026-11-05T17:00:00Z' },
    ])
    assert.deepEqual(resumo.map((r) => r.numero_cnj), ['B', 'A'])
  })

  test('processo sem histórico continua na lista, com zero tentativas', () => {
    const [resumo] = resumirNaoLocalizados([processo('A')], [])
    assert.deepEqual([resumo.tentativas, resumo.desde], [0, null])
  })
})
