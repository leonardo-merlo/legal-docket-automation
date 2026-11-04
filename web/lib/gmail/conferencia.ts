// O OK do Rafael em cada pauta lida (reunião de 09/10/2026): ele confere se os
// processos do e-mail chegaram certos e, se não, quantos vieram errados.

export interface EmailConferido {
  total_cnj: number | null
  conferencia_status: string | null
  conferencia_processos_errados: number | null
}

export interface AcertoDaLeitura {
  /** De 0 a 1; null enquanto nenhum e-mail foi conferido. */
  percentual: number | null
  certos: number
  total: number
  emailsConferidos: number
}

export function acertoDaLeitura(emails: EmailConferido[]): AcertoDaLeitura {
  let certos = 0
  let total = 0
  let emailsConferidos = 0
  for (const email of emails) {
    if (email.conferencia_status !== 'ok' && email.conferencia_status !== 'com_erro') continue
    emailsConferidos++
    const processos = email.total_cnj ?? 0
    const errados = email.conferencia_status === 'ok' ? 0 : Math.min(email.conferencia_processos_errados ?? 0, processos)
    total += processos
    certos += processos - errados
  }
  return { percentual: total > 0 ? certos / total : null, certos, total, emailsConferidos }
}
