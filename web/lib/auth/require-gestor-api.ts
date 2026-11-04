import { getUsuarioAtual, type UsuarioAtual } from './usuario-atual'

// Versão para Route Handlers: não redireciona (isso é papel do caller,
// que deve responder 401/403 em JSON), apenas resolve o usuário.
export async function requireGestorApi(): Promise<UsuarioAtual | null> {
  const usuario = await getUsuarioAtual()
  if (!usuario || usuario.papel !== 'gestor') return null
  return usuario
}
