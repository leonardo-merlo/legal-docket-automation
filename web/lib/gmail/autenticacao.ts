import type { GmailHeader } from './mime.ts'

// Sem isto, um e-mail com "From: intimacoes@..." forjado e assunto de pauta gravaria
// CNJs e devolveria processos para a fila. O From sozinho qualquer um escreve.
//
// A pauta real chega encaminhada pelo Microsoft 365 do escritório, sem DKIM e sem
// DMARC (medido em 09/10/2026 nas pautas de 07 e 08/10): o que o Gmail confirma é
// o SPF do domínio do escritório. Então vale qualquer um dos três, desde que no
// mesmo domínio do From: dkim=pass, dmarc=pass ou spf=pass.
//
// Só vale o primeiro Authentication-Results, o mais externo, e só se foi o próprio
// Gmail que o escreveu (mx.google.com): os de baixo vieram com a mensagem e quem
// forja o e-mail pode escrever o que quiser neles.
//
// Limite conhecido: a pauta chega encaminhada pelo Microsoft 365 do escritório, e o
// SPF aprovado é o desse encaminhamento. Isto prova que o e-mail passou pelo M365
// do escritório, não que saiu da OAB — e a OAB não assina os e-mails (o M365 mede
// spf=none, dkim=none). Ver docs/divida-tecnica.md antes de ligar o modo ativo.

function dominioDoEndereco(endereco: string): string | null {
  const limpo = (/<([^>]+)>/.exec(endereco)?.[1] ?? endereco).trim().replace(/^"|"$/g, '').toLowerCase()
  const arroba = limpo.lastIndexOf('@')
  return arroba >= 0 ? limpo.slice(arroba + 1) : limpo || null
}

function mesmoDominio(achado: string, dominio: string): boolean {
  return achado === dominio || achado.endsWith(`.${dominio}`)
}

export function remetenteAutenticado(headers: GmailHeader[] | undefined, cabecalhoFrom: string | null): boolean {
  if (!cabecalhoFrom) return false
  const dominio = dominioDoEndereco(cabecalhoFrom)
  if (!dominio) return false

  const resultado = (headers ?? []).find((header) => header.name.toLowerCase() === 'authentication-results')
  if (!resultado || !/^\s*mx\.google\.com\s*;/i.test(resultado.value)) return false
  // o comentário "(google.com: domain of <envelope> designates ...)" repete o
  // envelope do remetente, que ele mesmo escolhe: fora da conta
  const texto = resultado.value.toLowerCase().replace(/\([^)]*\)/g, ' ')

  for (const achado of texto.matchAll(/dkim=pass[^;]*?header\.(?:d|i)=@?([a-z0-9.-]+)/g)) {
    if (mesmoDominio(achado[1], dominio)) return true
  }
  for (const achado of texto.matchAll(/dmarc=pass[^;]*?header\.from=([a-z0-9.-]+)/g)) {
    if (mesmoDominio(achado[1], dominio)) return true
  }
  for (const trecho of texto.split(';')) {
    if (!/^\s*spf=pass\b/.test(trecho)) continue
    // o endereço inteiro até o espaço: o domínio é o que vem depois do último @
    const envelopes = [...trecho.matchAll(/smtp\.mailfrom=(\S+)/g)]
    const ultimo = envelopes.at(-1)?.[1]
    const doEnvelope = ultimo ? dominioDoEndereco(ultimo) : null
    if (doEnvelope && mesmoDominio(doEnvelope, dominio)) return true
  }
  return false
}
