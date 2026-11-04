import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { cifrar, decifrar } from './cripto.ts'

const chave = randomBytes(32).toString('base64')

describe('cifragem do refresh token', () => {
  test('devolve o texto original ao decifrar com a mesma chave', () => {
    assert.equal(decifrar(cifrar('token-de-teste', chave), chave), 'token-de-teste')
  })

  test('gera um texto cifrado diferente a cada chamada', () => {
    assert.notEqual(cifrar('token-de-teste', chave), cifrar('token-de-teste', chave))
  })

  test('falha quando o conteúdo cifrado foi adulterado', () => {
    const partes = cifrar('token-de-teste', chave).split(':')
    const conteudo = Buffer.from(partes[3], 'base64')
    conteudo[0] = conteudo[0] ^ 1
    partes[3] = conteudo.toString('base64')
    assert.throws(() => decifrar(partes.join(':'), chave))
  })

  test('falha quando a chave é outra', () => {
    const outraChave = randomBytes(32).toString('base64')
    assert.throws(() => decifrar(cifrar('token-de-teste', chave), outraChave))
  })

  test('recusa tag truncado', () => {
    const partes = cifrar('token-de-teste', chave).split(':')
    partes[2] = Buffer.from(partes[2], 'base64').subarray(0, 4).toString('base64')
    assert.throws(() => decifrar(partes.join(':'), chave))
  })

  test('recusa iv que não tem 12 bytes', () => {
    const partes = cifrar('token-de-teste', chave).split(':')
    partes[1] = randomBytes(8).toString('base64')
    assert.throws(() => decifrar(partes.join(':'), chave), /iv/i)
  })

  test('recusa chave que não tem 32 bytes', () => {
    assert.throws(() => cifrar('x', randomBytes(16).toString('base64')), /32 bytes/)
  })
})
