import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { bearerValido, iguaisEmTempoConstante } from './seguranca.ts'

describe('comparação em tempo constante', () => {
  test('aceita valores iguais', () => {
    assert.equal(iguaisEmTempoConstante('abc123', 'abc123'), true)
  })

  test('recusa valores diferentes, inclusive de tamanhos diferentes', () => {
    assert.equal(iguaisEmTempoConstante('abc123', 'abc124'), false)
    assert.equal(iguaisEmTempoConstante('abc', 'abc123'), false)
  })
})

describe('Bearer da sincronização', () => {
  test('aceita o segredo certo', () => {
    assert.equal(bearerValido('Bearer segredo-certo', 'segredo-certo'), true)
  })

  test('recusa segredo errado e cabeçalho sem Bearer', () => {
    assert.equal(bearerValido('Bearer outro', 'segredo-certo'), false)
    assert.equal(bearerValido('segredo-certo', 'segredo-certo'), false)
  })

  test('recusa tudo quando o segredo não está configurado', () => {
    assert.equal(bearerValido('Bearer ', ''), false)
    assert.equal(bearerValido('Bearer undefined', undefined), false)
    assert.equal(bearerValido(null, undefined), false)
  })
})
