import EsqueciSenhaForm from './EsqueciSenhaForm'

export default function EsqueciSenhaPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-text">Esqueci minha senha</h1>
          <p className="text-sm text-text-secondary">Informe o e-mail cadastrado</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-6">
          <EsqueciSenhaForm />
        </div>
      </div>
    </div>
  )
}
