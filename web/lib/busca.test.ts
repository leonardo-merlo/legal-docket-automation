import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { casaComBusca } from './busca.ts'

describe('busca de processos e tarefas', () => {
  test('acha a parte sem acento e em minúsculas', () => {
    assert.equal(casaComBusca('joao itau', ['JOÃO DA SILVA', 'ITAÚ UNIBANCO S.A.']), true)
  })

  test('exige todas as palavras digitadas', () => {
    assert.equal(casaComBusca('joao bradesco', ['JOÃO DA SILVA', 'ITAÚ UNIBANCO S.A.']), false)
  })

  test('busca vazia mostra tudo', () => {
    assert.equal(casaComBusca('   ', [null]), true)
  })
})
