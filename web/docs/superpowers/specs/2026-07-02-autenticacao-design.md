# Autenticação — Design

## Contexto

Hoje o app não tem autenticação real. Todas as páginas usam `createAdminClient()` (service role), ignorando RLS, e a tela `/tarefas` simula "usuário atual" com um dropdown controlado por `?usuario_id=` na URL. Qualquer pessoa com a URL acessa `/dashboard`, `/processos`, `/emails/[id]` e `/tarefas` sem restrição alguma.

Este design cobre a implementação de login real com dois perfis de acesso:

- **Gestor** — acesso total: dashboard, processos, e-mails, tarefas (todas), configurações (gestão de usuários).
- **Advogado/Estagiário** — acesso restrito: só a seção de Tarefas, só as próprias tarefas, mais visualização somente-leitura do processo relacionado a uma tarefa própria.

`estagiario` é tratado de forma idêntica a `advogado` em todas as regras de acesso — mesma classe de permissão, sem distinção.

## Decisões confirmadas

- Convite por e-mail com link de definição de senha (via `supabase.auth.admin.inviteUserByEmail`), usando o serviço de e-mail padrão do Supabase (sem SMTP próprio por enquanto — equipe pequena).
- Os 4 usuários já cadastrados em `usuarios` não recebem convite automático na migration; o gestor convida cada um manualmente pela nova tela de configurações.
- Vínculo entre `usuarios` e `auth.users` via nova coluna `usuarios.auth_user_id` (nullable, único) — não altera os IDs já usados como FK em `processos`/`tarefas`/`rascunhos`.
- Sem rota pública de cadastro — só entra quem foi convidado pelo gestor.
- Proteção de acesso aplicada no código do servidor (Server Components/Actions verificam sessão e papel), sem políticas RLS adicionais — mantém o padrão atual do projeto de usar o admin client.
- Middleware redireciona para `/login` qualquer requisição sem sessão válida (exceto rotas públicas: `/login`, `/esqueci-senha`, `/redefinir-senha`, `/convite`, e assets).
- Gestão de usuários na tela de configurações: convidar novo usuário + ativar/desativar acesso (usando a coluna `usuarios.ativo` já existente). Não inclui editar nome/e-mail/papel nem exclusão permanente nesta primeira versão.

## Arquitetura

### Vínculo de identidade

Nova coluna:
```sql
alter table usuarios
  add column auth_user_id uuid unique references auth.users(id);
```

Helper `lib/auth/usuario-atual.ts`:
- `getUsuarioAtual()`: lê a sessão via `createClient()` (server, `@supabase/ssr`), busca em `usuarios` por `auth_user_id` igual ao `session.user.id`, retorna `{ id, nome, papel, email } | null`.
- `requireGestor()`: chama `getUsuarioAtual()`; se `papel !== 'gestor'`, `redirect('/tarefas')`.
- `requireUsuario()`: chama `getUsuarioAtual()`; se `null` (sessão válida mas sem vínculo em `usuarios`), trata como erro de configuração (mensagem "conta sem perfil vinculado, fale com o gestor").

Middleware (`middleware.ts`) já cria o client de sessão; adiciona checagem: sem `session.user`, redireciona para `/login?next=<path original>`, exceto para as rotas públicas listadas acima.

### Fluxo de convite

1. Gestor abre `/configuracoes`, preenche nome/e-mail/papel.
2. Server Action `convidarUsuario` (em `app/configuracoes/actions.ts`):
   - Valida `requireGestor()`.
   - Faz upsert em `usuarios` (cria linha se não existir, pelo e-mail).
   - Chama `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: '.../convite' })`.
   - Atualiza `usuarios.auth_user_id` com o `id` retornado do usuário criado no Auth.
3. E-mail chega com link mágico → usuário cai autenticado em `/convite`.
4. `/convite` pede a senha nova, chama Server Action `definirSenha` → `supabase.auth.updateUser({ password })` → redirect para a home do papel (`/dashboard` gestor, `/tarefas` demais).

### Login / logout / recuperação de senha

- `/login`: form e-mail + senha → Server Action `login()` → `supabase.auth.signInWithPassword()`. Erro de credencial mostra mensagem genérica ("e-mail ou senha inválidos"). Sucesso: redireciona pra `/dashboard` (gestor) ou `/tarefas` (demais), respeitando `?next=` se presente e permitido pro papel.
- `/esqueci-senha`: form e-mail → Server Action `solicitarReset()` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: '.../redefinir-senha' })`. Sempre mostra a mesma mensagem de sucesso (não revela se o e-mail existe).
- `/redefinir-senha`: chega autenticado pelo link de reset → mesmo formulário/Server Action de definir senha nova (`definirSenha`, reutilizado do fluxo de convite).
- Logout: botão no `AppHeader`, Server Action `logout()` → `supabase.auth.signOut()` → redirect `/login`.

### Regras de acesso por rota

| Rota | Gestor | Advogado/Estagiário |
|---|---|---|
| `/dashboard` | OK | redireciona `/tarefas` |
| `/processos` (lista) | OK | redireciona `/tarefas` |
| `/emails/[id]` | OK | redireciona `/tarefas` |
| `/processos/[id]` | OK, todas as ações (aprovar/rejeitar/editar/reencaminhar) | OK **somente leitura** se existir `tarefas` com `responsavel_id = usuario.id` e `processo_id` = esse id; senão `404`/redireciona `/tarefas` |
| `/tarefas` | OK, com seletor "visualizando como" (mantém comportamento atual) | OK, sempre filtrado por `responsavel_id = usuario.id`, sem seletor, ignora `?usuario_id=` da URL |
| `/configuracoes` | OK | redireciona `/tarefas` |

Em `/processos/[id]`, quando acessado por advogado/estagiário via tarefa própria, os componentes de ação (aprovar rascunho, editar campos, reencaminhar, rejeitar) ficam ocultos — a página exibe documentos, texto do rascunho e resumo do processo normalmente.

### Tela de configurações (`/configuracoes`, gestor-only)

- Lista todos os `usuarios` (nome, e-mail, papel, status ativo/inativo, se já tem `auth_user_id` ou "convite pendente").
- Formulário "Convidar usuário": nome, e-mail, papel (select: gestor/advogado/estagiario).
- Toggle "ativar/desativar" por linha → Server Action `alternarAtivoUsuario(usuarioId, ativo)`. Usuário desativado tem a sessão futura bloqueada (checagem em `getUsuarioAtual()`: se `ativo === false`, trata como não autenticado e força logout).

### `AppHeader`

- Mostra nome do usuário logado + menu com "Sair" (chama `logout()`).
- Item de navegação "Configurações" visível só quando `papel === 'gestor'`.
- Itens "Revisão" (dashboard) e demais links gestor-only escondidos para advogado/estagiário — nav mostra só "Tarefas".

### `/tarefas` — ajuste do seletor

- `TarefasPage` deixa de aceitar `?usuario_id=` como fonte de verdade para não-gestor. Passa a chamar `getUsuarioAtual()`:
  - Se `papel === 'gestor'`: mantém lógica atual (usa `?usuario_id=` se presente, senão o próprio gestor) — comportamento idêntico ao de hoje.
  - Se não: ignora query param, usa sempre o próprio `usuario.id`.
- `TarefasClient` só renderiza o `<select>` de "visualizando como" quando `usuarioAtivo.papel === 'gestor'` (na prática, quando quem está logado é gestor).

## Fora de escopo (não incluído nesta versão)

- Edição de nome/e-mail/papel de usuário existente pela tela de configurações.
- Exclusão permanente de usuário.
- SMTP customizado para e-mails de convite/reset.
- Políticas RLS no banco (proteção fica só no código do servidor).
- Rate limiting adicional além do padrão do Supabase Auth.

## Testes manuais a cobrir na verificação

- Acesso sem sessão a qualquer rota → redireciona `/login`.
- Login com credencial errada → mensagem de erro, sem vazar qual campo está errado.
- Convite: gestor convida e-mail novo → e-mail chega → define senha → cai autenticado na home do papel certo.
- Advogado logado: `/dashboard`, `/processos`, `/emails/[id]`, `/configuracoes` redirecionam pra `/tarefas`.
- Advogado logado: `/tarefas` mostra só as tarefas dele, sem seletor.
- Advogado logado: abre `/processos/[id]` de uma tarefa própria → vê tudo, sem botões de ação. Tenta abrir `/processos/[id]` de um processo sem tarefa própria → bloqueado.
- Gestor logado: `/tarefas` mostra seletor "visualizando como" igual hoje.
- Esqueci minha senha → e-mail chega → redefine → login funciona com a senha nova.
- Gestor desativa um usuário ativo → próxima tentativa de acesso dele é tratada como deslogada.
