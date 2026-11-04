function parseLoteId(loteId: string): Date {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(loteId)) {
    const [d, m, y] = loteId.split('/')
    return new Date(`${y}-${m}-${d}T12:00:00`)
  }
  return new Date(`${loteId}T12:00:00`)
}

export function addBusinessDaysFrom(startIso: string, dias: number): string {
  const date = parseLoteId(startIso)
  let added = 0
  while (added < dias) {
    date.setDate(date.getDate() + 1)
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return date.toISOString().split('T')[0]
}

export function formatPrazoDate(dataPublicacao: string | null | undefined, dias: number | null): string {
  if (!dias) return '—'
  if (!dataPublicacao) return `${dias} d.u.`
  try {
    const iso = addBusinessDaysFrom(dataPublicacao, dias)
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  } catch {
    return `${dias} d.u.`
  }
}
