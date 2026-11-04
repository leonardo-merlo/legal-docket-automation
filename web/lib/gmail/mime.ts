export interface GmailHeader {
  name: string
  value: string
}

export interface GmailParte {
  mimeType?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailParte[]
}

export interface TextoExtraido {
  texto: string
  charset: string
}

export function lerHeader(parte: GmailParte, nome: string): string | null {
  const alvo = nome.toLowerCase()
  return parte.headers?.find((header) => header.name.toLowerCase() === alvo)?.value ?? null
}

function charsetDaParte(parte: GmailParte): string {
  const achado = /charset\s*=\s*"?([^";\s]+)"?/i.exec(lerHeader(parte, 'Content-Type') ?? '')
  return achado ? achado[1].toLowerCase() : 'utf-8'
}

function ehAnexo(parte: GmailParte): boolean {
  return /attachment/i.test(lerHeader(parte, 'Content-Disposition') ?? '')
}

function decodificar(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    // charset que o runtime não conhece: utf-8 perde acento, mas não perde o CNJ
    return new TextDecoder('utf-8').decode(bytes)
  }
}

// Busca em largura: o text/plain do e-mail fica mais perto da raiz do que o de
// uma mensagem encaminhada como anexo lá dentro.
export function extrairTextoPlano(raiz: GmailParte): TextoExtraido | null {
  const fila: GmailParte[] = [raiz]
  while (fila.length > 0) {
    const parte = fila.shift()
    if (!parte) break
    if (parte.mimeType?.toLowerCase() === 'text/plain' && parte.body?.data && !ehAnexo(parte)) {
      const charset = charsetDaParte(parte)
      return { texto: decodificar(Buffer.from(parte.body.data, 'base64url'), charset), charset }
    }
    fila.push(...(parte.parts ?? []))
  }
  return null
}

// Byte de 0x80 a 0x9F que o windows-1252 troca por um caractere visível.
const WINDOWS_1252_ALTO: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
}

// "Ã§", "Ã£", "Âº": um acento em UTF-8 lido como windows-1252 vira dois caracteres
const ACENTO_EMBARALHADO = /[ÂÃ][\u0080-\u00BF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/

// O encaminhamento do Outlook (ENC:) entrega o corpo da pauta com "Publicação" escrito
// "PublicaÃ§Ã£o", e o parser não acha um bloco sequer. Desfaz isso relendo o texto como
// bytes windows-1252 em UTF-8; se o resultado não for UTF-8 válido, devolve o original.
export function desembaralharAcentos(texto: string): string {
  if (!ACENTO_EMBARALHADO.test(texto)) return texto
  const bytes: number[] = []
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 0
    const alto = WINDOWS_1252_ALTO[caractere]
    if (alto !== undefined) bytes.push(alto)
    else if (codigo <= 0xff) bytes.push(codigo)
    else return texto
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(bytes))
  } catch {
    return texto
  }
}
