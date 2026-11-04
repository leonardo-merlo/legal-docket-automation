import type { Metadata } from 'next'
import Image from 'next/image'

export const metadata: Metadata = { title: 'Política de privacidade — Controladoria Exemplo' }

export default function PrivacidadePage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-bg px-4 py-12">
      <main className="mx-auto w-full max-w-2xl space-y-6">
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
        <div className="rounded-lg border border-border bg-surface-raised p-6 space-y-6 text-sm text-text-secondary">
          <h1 className="text-lg font-semibold text-text">Política de privacidade</h1>
          <p>
            O painel da Controladoria Exemplo Advogados é de uso interno do escritório. Esta
            página explica o que ele faz com a conta Google conectada a ele.
          </p>
          <section className="space-y-2">
            <h2 className="text-base font-medium text-text">O que é lido</h2>
            <p>
              Com a permissão de <strong>somente leitura do Gmail</strong>, o painel busca apenas os e-mails
              do serviço Recorte Digital da OAB/MG (a pauta diária de publicações) e extrai deles os números
              dos processos e os dados de cabeçalho da publicação. Nenhum e-mail é enviado, apagado, marcado
              como lido ou alterado.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-medium text-text">Onde fica guardado</h2>
            <p>
              O texto desses e-mails e os dados extraídos ficam no banco de dados do painel, acessível só à
              equipe do escritório. A credencial de acesso ao Gmail é guardada cifrada e nunca é mostrada na
              tela.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-medium text-text">Compartilhamento</h2>
            <p>
              Os dados não são vendidos nem compartilhados com terceiros. O uso e a transferência de
              informações recebidas das APIs do Google obedecem à Política de Dados do Usuário dos Serviços
              de API do Google, incluindo os requisitos de Uso Limitado.
            </p>
          </section>
          <section className="space-y-2">
            <h2 className="text-base font-medium text-text">Como revogar</h2>
            <p>
              O acesso pode ser retirado a qualquer momento em myaccount.google.com/permissions. Dúvidas:
              intimacoes@exemplo-adv.example.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
