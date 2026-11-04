import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { numerosDaPublicacao, observacoesSemDuplicado } from './publicacao.ts'

describe('número da publicação de processo repetido na pauta', () => {
  test('mostra todos os números da linha de duplicado', () => {
    assert.equal(numerosDaPublicacao('37', 'Duplicado na pauta: 3x, publicações 22, 23, 37'), '22, 23, 37')
  })

  test('sem duplicado fica o número gravado', () => {
    assert.equal(numerosDaPublicacao('5', 'Publicação nova em 08/10/2026'), '5')
  })

  test('tira a linha de duplicado e mantém os outros avisos', () => {
    const observacoes = 'Duplicado na pauta: 2x, publicações 6, 7\nPublicação nova em 08/10/2026'
    assert.equal(observacoesSemDuplicado(observacoes), 'Publicação nova em 08/10/2026')
  })

  test('só a linha de duplicado vira observação vazia', () => {
    assert.equal(observacoesSemDuplicado('Duplicado na pauta: 2x, publicações 6, 7'), null)
  })
})
