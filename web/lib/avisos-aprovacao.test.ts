import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosDeAprovacao, type ContextoAprovacao } from './avisos-aprovacao.ts'

const BASE: ContextoAprovacao = {
  pauta: '2026-10-15',
  ehMaisRecente: true,
  pautaMaisRecente: null,
  publicacaoAtual: { pauta: '2026-10-15', status: 'processado' },
  criaTarefa: true,
  tarefasAbertas: [],
}

describe('avisos antes de aprovar', () => {
  test('rascunho mais recente, sem publicação nova nem tarefa, não avisa nada', () => {
    assert.deepEqual(avisosDeAprovacao(BASE), [])
  })

  test('avisa quando existe uma análise mais recente', () => {
    const avisos = avisosDeAprovacao({ ...BASE, ehMaisRecente: false, pautaMaisRecente: '2026-10-16' })
    assert.deepEqual(avisos, ['Esta análise é de 15/10 e existe uma mais recente, de 16/10. Aprovar mesmo assim?'])
  })

  test('avisa quando o processo saiu de novo e ainda não foi reanalisado', () => {
    const avisos = avisosDeAprovacao({ ...BASE, publicacaoAtual: { pauta: '2026-10-16', status: 'pendente' } })
    assert.deepEqual(avisos, ['Esta análise é de 15/10 e o processo teve publicação nova em 16/10, ainda não analisada. Aprovar mesmo assim?'])
  })

  test('avisa uma vez para cada tarefa aberta, com responsável e prazo', () => {
    const avisos = avisosDeAprovacao({ ...BASE, tarefasAbertas: [{ responsavel: 'Marina', prazoFatal: '2026-10-23' }] })
    assert.deepEqual(avisos, ['Este processo já tem uma tarefa aberta com Marina, prazo 23/10/2026. Criar outra mesmo assim?'])
  })

  test('aguardar não cria tarefa, então não avisa da tarefa aberta', () => {
    const avisos = avisosDeAprovacao({ ...BASE, criaTarefa: false, tarefasAbertas: [{ responsavel: 'Marina', prazoFatal: null }] })
    assert.deepEqual(avisos, [])
  })
})
