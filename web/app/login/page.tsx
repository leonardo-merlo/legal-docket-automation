import Image from 'next/image'
import LoginForm from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Image
            src="/logo.svg"
            alt="Exemplo Advogados"
            width={504}
            height={265}
            className="mx-auto h-auto w-56"
            priority
          />
        </div>
        <div className="rounded-lg border border-border bg-surface-raised p-6">
          <LoginForm next={next ?? ''} />
        </div>
      </div>
    </div>
  )
}
