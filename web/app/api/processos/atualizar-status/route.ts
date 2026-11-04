import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'

interface RequestBody {
  numero_cnj: string
  novo_status: string
}

export async function POST(request: NextRequest) {
  const gestor = await requireGestorApi()
  if (!gestor) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  let body: RequestBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  const { numero_cnj, novo_status } = body

  if (!numero_cnj || !novo_status) {
    return NextResponse.json(
      { error: 'Campos obrigatórios ausentes: numero_cnj, novo_status.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('processos')
    .update({ status_atual: novo_status })
    .eq('numero_cnj', numero_cnj)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 200 })
}
