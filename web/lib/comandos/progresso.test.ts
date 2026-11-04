import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { formatarDuracao, resumirProgresso } from './progresso.ts'

describe('progresso da rodada', () => {
  test('conta os processos terminados contra o tamanho da fila', () => {
    const eventos = [
      { etapa: 'previvo.inicio', dados: { cnjs: 17, ordem: ['pje_tjmg'] } },
      { etapa: 'cnj.fim', dados: { posicao: 1 } },
      { etapa: 'sistema.inicio', dados: null },
      { etapa: 'cnj.fim', dados: { posicao: 2 } },
    ]
    assert.deepEqual(resumirProgresso(eventos), { feitos: 2, total: 17 })
  })

  test('devolve nada enquanto a fila ainda não foi montada', () => {
    assert.equal(resumirProgresso([{ etapa: 'chrome.config', dados: null }]), null)
  })

  test('ignora total ilegível no evento da fila', () => {
    assert.equal(resumirProgresso([{ etapa: 'previvo.inicio', dados: { cnjs: 'x' } }]), null)
  })
})

describe('tempo da rodada', () => {
  const inicio = '2026-10-12T16:15:00Z'

  test('mostra minutos na primeira hora', () => {
    assert.equal(formatarDuracao(inicio, new Date('2026-10-12T16:27:40Z')), '12 min')
  })

  test('mostra horas e minutos depois de uma hora', () => {
    assert.equal(formatarDuracao(inicio, new Date('2026-10-12T17:20:00Z')), '1 h 05 min')
  })

  test('diz menos de 1 min logo no começo', () => {
    assert.equal(formatarDuracao(inicio, new Date('2026-10-12T16:15:20Z')), 'menos de 1 min')
  })
})
