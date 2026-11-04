import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { atribuirRascunhos, entraNaTaxa, resolverPublicacoes } from './publicacoes.ts'

function publicacao(id: string, pauta: string, criadaEm: string, status: string | null) {
  return { id, processo_id: 'p1', pauta, criada_em: criadaEm, pje_status: status }
}

describe('publicação substituída', () => {
  test('herda o estado da publicação seguinte do mesmo processo', () => {
    const resolvidas = resolverPublicacoes([
      publicacao('a', '2026-10-15', '2026-10-15T13:00:00Z', 'substituida'),
      publicacao('b', '2026-10-16', '2026-10-16T13:00:00Z', 'processado'),
    ])
    assert.equal(resolvidas.get('a')?.statusEfetivo, 'processado')
  })

  test('diz com qual pauta foi analisada, mesmo atravessando outra substituída', () => {
    const resolvidas = resolverPublicacoes([
      publicacao('a', '2026-10-14', '2026-10-14T13:00:00Z', 'substituida'),
      publicacao('b', '2026-10-15', '2026-10-15T13:00:00Z', 'substituida'),
      publicacao('c', '2026-10-16', '2026-10-16T13:00:00Z', 'processado'),
    ])
    assert.equal(resolvidas.get('a')?.analisadaCom, '2026-10-16')
  })

  test('publicação que não foi substituída mantém o próprio estado', () => {
    const resolvidas = resolverPublicacoes([
      publicacao('a', '2026-10-15', '2026-10-15T13:00:00Z', 'processado'),
      publicacao('b', '2026-10-16', '2026-10-16T13:00:00Z', 'pendente'),
    ])
    assert.equal(resolvidas.get('a')?.statusEfetivo, 'processado')
  })
})

describe('rascunho e a publicação que ele analisou', () => {
  const publicacoes = [
    publicacao('a', '2026-10-15', '2026-10-15T13:14:00Z', 'processado'),
    publicacao('b', '2026-10-16', '2026-10-16T13:27:00Z', 'pendente'),
  ]

  test('fica com a publicação mais recente que já existia quando foi gravado', () => {
    const dono = atribuirRascunhos(publicacoes, [
      { id: 'r1', processo_id: 'p1', data_extracao: '2026-10-15T16:03:00Z', data_criacao: null },
    ])
    assert.equal(dono.get('r1'), 'a')
  })

  test('reanálise depois da publicação nova vai para a nova', () => {
    const dono = atribuirRascunhos(publicacoes, [
      { id: 'r1', processo_id: 'p1', data_extracao: '2026-10-17T10:00:00Z', data_criacao: '2026-10-15T16:03:00Z' },
    ])
    assert.equal(dono.get('r1'), 'b')
  })
})

describe('taxa de extração', () => {
  test('não conta o que ainda não foi tentado', () => {
    assert.equal(entraNaTaxa('pendente', false), false)
  })

  test('conta o processo feito na mão como não extraído', () => {
    assert.equal(entraNaTaxa('tratado_manual', false), true)
  })

  test('não conta duplicata', () => {
    assert.equal(entraNaTaxa('processado', true), false)
  })
})
