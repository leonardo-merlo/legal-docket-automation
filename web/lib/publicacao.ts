// Até 09/10/2026 o processo repetido na pauta guardava só o número do último bloco em
// numero_publicacao e os outros em observacoes ("Duplicado na pauta: 2x, publicações
// 20, 21"). O Rafael quer ver "20, 21" no próprio número, como na página do e-mail.
// A leitura abaixo vale para as linhas antigas sem regravar nenhuma.
const LINHA_DUPLICADO = /^Duplicado na pauta: \d+x, publicações ([\d, ]+)$/

function linhaDeDuplicado(observacoes: string | null): RegExpExecArray | null {
  for (const linha of (observacoes ?? '').split('\n')) {
    const achado = LINHA_DUPLICADO.exec(linha.trim())
    if (achado) return achado
  }
  return null
}

/** "20, 21" quando o processo veio repetido na pauta; senão o número gravado. */
export function numerosDaPublicacao(numeroPublicacao: string | null, observacoes: string | null): string | null {
  return linhaDeDuplicado(observacoes)?.[1].trim() ?? numeroPublicacao
}

/** As observações sem a linha de duplicado, que já aparece no número. */
export function observacoesSemDuplicado(observacoes: string | null): string | null {
  const resto = (observacoes ?? '')
    .split('\n')
    .filter((linha) => !LINHA_DUPLICADO.test(linha.trim()))
    .join('\n')
    .trim()
  return resto || null
}
