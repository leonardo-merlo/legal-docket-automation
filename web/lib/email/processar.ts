import { createAdminClient } from '@/lib/supabase/admin'

const CNJ_PATTERN = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/

export type ResultadoProcessamento = {
  novos: string[]
  ja_existentes: string[]
  duplicatas: string[]
}

function extrairNumerosPorPublicacao(textoEmail: string): string[] {
  const blocos = textoEmail.split(/\n\s*\n/).filter((b) => b.trim())
  return blocos
    .map((bloco) => {
      const match = bloco.match(CNJ_PATTERN)
      return match ? match[0] : null
    })
    .filter((num): num is string => num !== null)
}

export async function processarEmailTexto(textoEmail: string): Promise<ResultadoProcessamento> {
  const numerosExtraidos = extrairNumerosPorPublicacao(textoEmail)

  const contagem = new Map<string, number>()
  for (const num of numerosExtraidos) {
    contagem.set(num, (contagem.get(num) ?? 0) + 1)
  }

  const duplicatas = [...contagem.entries()]
    .filter(([, count]) => count > 1)
    .map(([num]) => num)

  const numerosUnicos = [...contagem.entries()]
    .filter(([, count]) => count === 1)
    .map(([num]) => num)

  const supabase = createAdminClient()
  const hoje = new Date().toISOString().split('T')[0]

  const novos: string[] = []
  const jaExistentes: string[] = []

  for (const numero of numerosUnicos) {
    const { data: existente, error: erroConsulta } = await supabase
      .from('processos')
      .select('id')
      .eq('numero_cnj', numero)
      .maybeSingle()

    if (erroConsulta) {
      throw new Error(`Erro ao consultar processo ${numero}: ${erroConsulta.message}`)
    }

    if (existente) {
      jaExistentes.push(numero)
    } else {
      const { error: erroInsert } = await supabase.from('processos').insert({
        numero_cnj: numero,
        status_atual: 'PENDENTE',
        pje_status: 'pendente',
      })

      if (erroInsert) {
        throw new Error(`Erro ao inserir processo ${numero}: ${erroInsert.message}`)
      }

      novos.push(numero)
    }
  }

  return { novos, ja_existentes: jaExistentes, duplicatas }
}
