import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireGestorApi } from '@/lib/auth/require-gestor-api'

interface RequestBody {
  rascunho_id: string
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

  const { rascunho_id, novo_status } = body

  if (!rascunho_id || !novo_status) {
    return NextResponse.json(
      { error: 'Campos obrigatórios ausentes: rascunho_id, novo_status.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('rascunhos')
    .update({
      status: novo_status,
      data_revisao: novo_status === 'aprovado' ? new Date().toISOString() : null,
    })
    .eq('id', rascunho_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 200 })
}
