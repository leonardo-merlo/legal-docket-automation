import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Formato gravado no banco: v1:<iv>:<tag>:<conteúdo>, cada parte em base64.
// A versão na frente permite trocar o algoritmo sem perder os tokens já gravados.
const VERSAO = 'v1'

function lerChave(chaveBase64: string): Buffer {
  const chave = Buffer.from(chaveBase64, 'base64')
  if (chave.length !== 32) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY precisa ter 32 bytes em base64.')
  }
  return chave
}

export function cifrar(textoPlano: string, chaveBase64: string): string {
  const iv = randomBytes(12)
  const cifra = createCipheriv('aes-256-gcm', lerChave(chaveBase64), iv)
  const conteudo = Buffer.concat([cifra.update(textoPlano, 'utf8'), cifra.final()])
  return [VERSAO, iv.toString('base64'), cifra.getAuthTag().toString('base64'), conteudo.toString('base64')].join(':')
}

export function decifrar(cifrado: string, chaveBase64: string): string {
  const [versao, iv, tag, conteudo] = cifrado.split(':')
  if (versao !== VERSAO || !iv || !tag || !conteudo) {
    throw new Error('Token cifrado em formato desconhecido.')
  }
  const ivBytes = Buffer.from(iv, 'base64')
  const tagBytes = Buffer.from(tag, 'base64')
  if (ivBytes.length !== 12) throw new Error('Token cifrado com iv de tamanho inválido.')
  if (tagBytes.length !== 16) throw new Error('Token cifrado com tag de tamanho inválido.')
  const decifra = createDecipheriv('aes-256-gcm', lerChave(chaveBase64), ivBytes, { authTagLength: 16 })
  decifra.setAuthTag(tagBytes)
  return Buffer.concat([decifra.update(Buffer.from(conteudo, 'base64')), decifra.final()]).toString('utf8')
}
