import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'

export async function POST(request: NextRequest) {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  let body: { numero_cnj?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  const { numero_cnj } = body
  if (!numero_cnj) {
    return NextResponse.json({ error: 'numero_cnj é obrigatório.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: processo, error: processoError } = await supabase
    .from('processos')
    .select('id')
    .eq('numero_cnj', numero_cnj)
    .single()

  if (processoError || !processo) {
    return NextResponse.json({ error: 'Processo não encontrado.' }, { status: 404 })
  }

  const { data: rascunho, error: rascunhoError } = await supabase
    .from('rascunhos')
    .select('*')
    .eq('processo_id', processo.id)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (rascunhoError || !rascunho) {
    return NextResponse.json(
      { error: 'Nenhum rascunho pendente para este processo. Rode o extrator primeiro.' },
      { status: 404 }
    )
  }

  return NextResponse.json({ data: rascunho }, { status: 200 })
}
