import { describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { remetenteAutenticado } from './autenticacao.ts'

const FROM = '"Intimações Exemplo Advogados" <intimacoes@exemplo-adv.example>'

// cabeçalhos da pauta real de 08/10/2026, encaminhada pelo Microsoft 365 do escritório
const PAUTA_REAL = [
  {
    name: 'Authentication-Results',
    value:
      'mx.google.com; arc=pass (i=1); spf=pass (google.com: domain of intimacoes+srs=mccrj=h6=recortedigital.adv.br=oabmg@exemplo-adv.example designates 2a01:111:f403:d107::1 as permitted sender) smtp.mailfrom="Intimacoes+SRS=mcCRj=H6=recortedigital.adv.br=oabmg@exemplo-adv.example"',
  },
  { name: 'From', value: FROM },
]

describe('remetente autenticado', () => {
  test('aceita a pauta real: SPF aprovado no domínio do escritório', () => {
    assert.equal(remetenteAutenticado(PAUTA_REAL, FROM), true)
  })

  test('recusa From do escritório enviado de outro domínio', () => {
    const forjado = [{ name: 'Authentication-Results', value: 'mx.google.com; spf=pass smtp.mailfrom=golpe@outro.com; dkim=none' }]
    assert.equal(remetenteAutenticado(forjado, FROM), false)
  })

  test('recusa quando o SPF falhou', () => {
    const falhou = [{ name: 'Authentication-Results', value: 'mx.google.com; spf=fail smtp.mailfrom=intimacoes@exemplo-adv.example' }]
    assert.equal(remetenteAutenticado(falhou, FROM), false)
  })

  test('ignora resultado que não foi escrito pelo Gmail', () => {
    const plantado = [{ name: 'Authentication-Results', value: 'servidor.falso; dkim=pass header.d=exemplo-adv.example' }]
    assert.equal(remetenteAutenticado(plantado, FROM), false)
  })

  test('aceita DKIM aprovado no domínio do From', () => {
    const comDkim = [{ name: 'Authentication-Results', value: 'mx.google.com; dkim=pass header.i=@recortedigital.adv.br header.s=x' }]
    assert.equal(remetenteAutenticado(comDkim, 'oabmg@recortedigital.adv.br'), true)
  })

  test('não se engana com o envelope repetido no comentário do Gmail', () => {
    const plantado = [{
      name: 'Authentication-Results',
      value: 'mx.google.com; spf=pass (google.com: domain of "smtp.mailfrom=intimacoes@exemplo-adv.example"@golpe.com designates 1.2.3.4 as permitted sender) smtp.mailfrom="smtp.mailfrom=intimacoes@exemplo-adv.example"@golpe.com',
    }]
    assert.equal(remetenteAutenticado(plantado, FROM), false)
  })

  test('sem o cabeçalho do Gmail no topo, recusa mesmo com outro mx.google.com abaixo', () => {
    const semGmail = [
      { name: 'Authentication-Results', value: 'servidor.qualquer; spf=none' },
      { name: 'Authentication-Results', value: 'mx.google.com; dkim=pass header.d=exemplo-adv.example' },
    ]
    assert.equal(remetenteAutenticado(semGmail, FROM), false)
  })

  test('vale só o primeiro resultado do Gmail, o mais externo', () => {
    const empilhado = [
      { name: 'Authentication-Results', value: 'mx.google.com; spf=fail smtp.mailfrom=golpe@outro.com' },
      { name: 'Authentication-Results', value: 'mx.google.com; dkim=pass header.d=exemplo-adv.example' },
    ]
    assert.equal(remetenteAutenticado(empilhado, FROM), false)
  })
})
