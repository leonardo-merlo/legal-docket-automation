import DefinirSenhaForm from '@/components/auth/definir-senha-form'

export default function ConvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-lg border border-border bg-surface-raised p-6">
          <DefinirSenhaForm
            titulo="Bem-vindo(a) — defina sua senha"
            textoBotao="Criar acesso"
          />
        </div>
      </div>
    </div>
  )
}
