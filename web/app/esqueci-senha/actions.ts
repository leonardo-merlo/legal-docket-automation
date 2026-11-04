'use server'

import { createClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/auth/base-url'

export type EsqueciSenhaState = { mensagem?: string }

const MENSAGEM_PADRAO =
  'Se este e-mail estiver cadastrado, você vai receber um link para redefinir a senha.'

export async function solicitarReset(
  _prevState: EsqueciSenhaState,
  formData: FormData
): Promise<EsqueciSenhaState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()

  if (!email) return { mensagem: MENSAGEM_PADRAO }

  const supabase = await createClient()
  const baseUrl = await getBaseUrl()

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/confirm?next=/redefinir-senha`,
  })

  return { mensagem: MENSAGEM_PADRAO }
}
