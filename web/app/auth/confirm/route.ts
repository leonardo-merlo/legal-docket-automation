import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// O Supabase manda o token de formas diferentes dependendo do fluxo:
// "esqueci senha" (resetPasswordForEmail via cliente PKCE) manda `?code=`;
// convite (admin.inviteUserByEmail) manda os tokens no fragmento da URL,
// que nunca chega aqui no servidor — nesse caso só repassamos pra `next`
// e o componente cliente da página final é quem le o fragmento.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const next = searchParams.get('next') ?? '/'
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = await createClient()

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  } else if (tokenHash && type) {
    await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  }

  redirect(next)
}
