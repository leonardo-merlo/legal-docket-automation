import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { desembaralharAcentos, extrairTextoPlano, lerHeader, type GmailParte } from './mime.ts'

const TEXTO = 'Publicação: 1.\nVara: 1ª Vara Cível da Comarca de Cidade Teste'

function parteDeTexto(mimeType: string, texto: string, charset: string, codificacao: BufferEncoding): GmailParte {
  return {
    mimeType,
    headers: [{ name: 'Content-Type', value: `${mimeType}; charset="${charset}"` }],
    body: { data: Buffer.from(texto, codificacao).toString('base64url') },
  }
}

// windows-1252 e latin1 coincidem nos acentos do português (ç, ã, ª, í), então
// o 'latin1' do Buffer produz exatamente os bytes que o e-mail real traz
const EMAIL_DA_OAB: GmailParte = {
  mimeType: 'multipart/related',
  headers: [{ name: 'From', value: 'Intimações <Intimacoes@exemplo-adv.example>' }],
  parts: [
    {
      mimeType: 'multipart/alternative',
      parts: [
        parteDeTexto('text/plain', TEXTO, 'windows-1252', 'latin1'),
        parteDeTexto('text/html', '<p>html</p>', 'windows-1252', 'latin1'),
      ],
    },
    { mimeType: 'image/png', body: { attachmentId: 'imagem-1', size: 10 } },
  ],
}

describe('extração do text/plain', () => {
  test('decodifica base64url e depois o windows-1252 da parte', () => {
    assert.equal(extrairTextoPlano(EMAIL_DA_OAB)?.texto, TEXTO)
  })

  test('informa o charset usado', () => {
    assert.equal(extrairTextoPlano(EMAIL_DA_OAB)?.charset, 'windows-1252')
  })

  test('lê utf-8 quando a parte declara utf-8', () => {
    const payload = parteDeTexto('text/plain', TEXTO, 'utf-8', 'utf8')
    assert.equal(extrairTextoPlano(payload)?.texto, TEXTO)
  })

  test('reconhece o mimeType sem diferenciar maiúsculas', () => {
    const payload = parteDeTexto('TEXT/PLAIN', TEXTO, 'utf-8', 'utf8')
    assert.equal(extrairTextoPlano(payload)?.texto, TEXTO)
  })

  test('devolve null quando não há text/plain', () => {
    const soHtml: GmailParte = { mimeType: 'multipart/alternative', parts: [parteDeTexto('text/html', '<p>x</p>', 'utf-8', 'utf8')] }
    assert.equal(extrairTextoPlano(soHtml), null)
  })

  test('ignora text/plain que vem como anexo', () => {
    const anexo = parteDeTexto('text/plain', 'anexo', 'utf-8', 'utf8')
    anexo.headers?.push({ name: 'Content-Disposition', value: 'attachment; filename="a.txt"' })
    const payload: GmailParte = { mimeType: 'multipart/mixed', parts: [anexo] }
    assert.equal(extrairTextoPlano(payload), null)
  })
})

describe('leitura de header', () => {
  test('acha o header sem diferenciar maiúsculas', () => {
    assert.equal(lerHeader(EMAIL_DA_OAB, 'from'), 'Intimações <Intimacoes@exemplo-adv.example>')
  })

  test('devolve null quando o header não existe', () => {
    assert.equal(lerHeader(EMAIL_DA_OAB, 'Subject'), null)
  })
})

describe('acento embaralhado pelo encaminhamento', () => {
  const embaralhado = (texto: string): string => new TextDecoder('windows-1252').decode(Buffer.from(texto, 'utf8'))

  test('devolve "Publicação" a partir de "PublicaÃ§Ã£o"', () => {
    assert.equal(desembaralharAcentos(embaralhado('Publicação: 1.')), 'Publicação: 1.')
  })

  test('recupera letras que o windows-1252 troca por símbolo', () => {
    const texto = 'NÚMERO nº É Ó Ê Ç Á à'
    assert.equal(desembaralharAcentos(embaralhado(texto)), texto)
  })

  test('não mexe em texto com acento correto', () => {
    assert.equal(desembaralharAcentos(TEXTO), TEXTO)
  })

  test('não mexe quando o texto embaralhado não volta a ser UTF-8 válido', () => {
    const texto = 'Ã§ seguido de çã de verdade'
    assert.equal(desembaralharAcentos(texto), texto)
  })
})
