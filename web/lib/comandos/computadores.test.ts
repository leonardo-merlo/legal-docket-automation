import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { acharAgente, agenteLigado, rotuloDoAgente } from './computadores.ts'

const agora = new Date('2026-10-12T20:00:00Z')

describe('agente ligado', () => {
  test('conta como ligado quem deu sinal nos últimos 2 minutos', () => {
    assert.equal(agenteLigado('2026-10-12T19:58:30Z', agora), true)
  })

  test('conta como desligado quem sumiu há mais de 2 minutos', () => {
    assert.equal(agenteLigado('2026-10-12T19:57:00Z', agora), false)
  })

  test('conta como desligado quando o horário é ilegível', () => {
    assert.equal(agenteLigado('ontem', agora), false)
  })
})

describe('nome do computador no painel', () => {
  const marina = { id: 'DESKTOP-J', nome: 'Marina', visto_em: '' }
  const rafael = { id: 'DESKTOP-H', nome: 'User', visto_em: '' }
  const outro = { id: 'NOTE-H', nome: 'User', visto_em: '' }

  test('mostra só o nome quando ele é único', () => {
    assert.equal(rotuloDoAgente(marina, [marina, rafael]), 'Marina')
  })

  test('desempata nomes repetidos com o nome do Windows', () => {
    assert.equal(rotuloDoAgente(rafael, [marina, rafael, outro]), 'User (DESKTOP-H)')
  })

  test('não acha computador que não está mais registrado', () => {
    assert.equal(acharAgente('SUMIU', [marina]), null)
  })
})
