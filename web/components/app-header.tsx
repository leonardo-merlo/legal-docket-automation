import Image from 'next/image'
import Link from 'next/link'
import LogoutButton from './logout-button'

interface AppHeaderProps {
  active: 'dashboard' | 'tarefas' | 'configuracoes'
  usuario: { nome: string; papel: string }
  /**
   * Largura do miolo do cabeçalho. Existe para a tela que precisa de mais
   * espaço horizontal poder alargar sem que a tabela fique passando por fora
   * das bordas do cabeçalho. Recebe a classe pronta do Tailwind — montada em
   * tempo de execução ela não existiria na folha de estilo.
   */
  largura?: string
}

export default function AppHeader({ active, usuario, largura = 'max-w-5xl' }: AppHeaderProps) {
  const isGestor = usuario.papel === 'gestor'

  function linkClass(rota: AppHeaderProps['active']): string {
    return `rounded px-3 py-1.5 text-sm transition-colors ${
      active === rota
        ? 'font-medium text-text border-b-2 border-accent rounded-none pb-[5px]'
        : 'text-text-secondary hover:text-text'
    }`
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface">
      <div className={`mx-auto flex h-16 ${largura} items-center justify-between px-4 gap-4`}>
        <div className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/logo.svg"
            alt="Exemplo Advogados"
            width={504}
            height={265}
            className="h-9 w-auto object-contain"
          />
          <span className="text-border-subtle select-none text-sm">/</span>
          <span className="text-sm text-text-secondary">Controladoria</span>
        </div>

        <nav className="flex items-center gap-1">
          {isGestor && (
            <Link href="/dashboard" className={linkClass('dashboard')}>
              Revisão
            </Link>
          )}
          <Link href="/tarefas" className={linkClass('tarefas')}>
            Tarefas
          </Link>
          {isGestor && (
            <Link href="/configuracoes" className={linkClass('configuracoes')}>
              Configurações
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-text-secondary">{usuario.nome}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  )
}
