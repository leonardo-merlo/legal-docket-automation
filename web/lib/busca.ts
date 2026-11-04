/** Sem acento e em minúsculas: "joão" acha "JOAO" e vice-versa. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Todas as palavras digitadas precisam aparecer, em qualquer ordem. */
export function casaComBusca(busca: string, campos: (string | null | undefined)[]): boolean {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return true
  const texto = normalizar(campos.filter(Boolean).join(' '))
  return termos.every((termo) => texto.includes(termo))
}
