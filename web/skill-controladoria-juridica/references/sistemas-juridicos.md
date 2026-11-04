# Sistemas Judiciais — Referência de Acesso

## Credenciais (Supabase Vault)

Todas as credenciais estão no Supabase Vault. Recupere-as antes de iniciar o browser:

| Chave no Vault       | Uso                                |
| -------------------- | ---------------------------------- |
| `pje_usuario`        | Login do PJE TJMG                  |
| `pje_senha`          | Senha do PJE TJMG                  |
| `eproc_tjmg_usuario` | Login Eproc TJMG                   |
| `eproc_tjmg_senha`   | Senha Eproc TJMG                   |
| `eproc_trf6_usuario` | Login Eproc TRF6                   |
| `eproc_trf6_senha`   | Senha Eproc TRF6                   |
| `rafael_email`     | E-mail de destino para notificação |

Para recuperar do Vault via Supabase:

```sql
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = '{chave}';
```

---

## Estratégia de Seletores CSS — Regra Geral

> ⚠️ Os sistemas judiciais (especialmente o PJE) atualizam seus IDs e classes CSS sem aviso.
> Seletores hardcoded quebram silenciosamente entre versões.
>
> **Regra obrigatória:** sempre tente o seletor CSS exato primeiro. Se não encontrar o elemento
> em até 5 segundos, **alterne para busca por texto visível** usando o Claude in Chrome:
> descreva o elemento pelo rótulo que aparece na tela (ex.: "campo com placeholder 'Número do
> processo'", "botão com texto 'Pesquisar'", "aba chamada 'Movimentações'").
> Registre qual método funcionou em `observacoes` para facilitar debugging futuro.

---

## Sistema 1: PJE TJMG

**URL de login:** `https://pje.tjmg.jus.br/pje/login.seam`

### Fluxo de login:

1. Navegue até a URL de login
2. Preencha o campo `#username` com `pje_usuario` — fallback: campo com label "Usuário" ou "Login"
3. Preencha o campo `#password` com `pje_senha` — fallback: campo com label "Senha"
4. Clique no botão de submit (`button[type="submit"]` ou `#btnEntrar`) — fallback: botão com texto "Entrar" ou "Acessar"
5. Aguarde o redirecionamento para a tela inicial

### Busca do processo:

1. Localize o campo de busca por número:
   - Seletor: `input[placeholder*="número"]` ou `#fPP:numProcesso-inputNumeroProcesso`
   - Fallback: campo com placeholder "Número do processo" ou label "Processo"
2. Digite o número CNJ completo (com pontuação: `XXXXXXX-XX.XXXX.X.XX.XXXX`)
3. Clique em pesquisar — fallback: botão com texto "Pesquisar" ou "Consultar"
4. Clique no processo na lista de resultados

### Extração de documentos:

1. Na aba de movimentações/andamentos, identifique os itens com data recente
   - Fallback: aba com texto "Movimentações", "Andamentos" ou "Autos"
2. Para cada item com ícone de documento, clique para abrir
3. Extraia o texto completo do documento (`.documento-texto`, `.conteudo-documento`, ou similar)
   - Fallback: container principal com o texto do despacho após abertura
4. Se o documento abrir em nova aba/popup, capture o texto e feche
5. Concatene os textos com separador `\n---DOCUMENTO---\n`

### Detecção de CAPTCHA:

- Presença de `img[src*="captcha"]`, `div.g-recaptcha`, ou iframe do reCAPTCHA
- Também monitore: elemento com texto "Verificação de segurança", "Prove que você é humano"

---

## Sistema 2: Eproc TJMG

**URL de login:** `https://eproc.tjmg.jus.br/eproc/login.php`

### Fluxo de login:

1. Navegue até a URL de login
2. Preencha `#txtEntradaLogin` com `eproc_tjmg_usuario` — fallback: campo com label "Usuário"
3. Preencha `#txtEntradaSenha` com `eproc_tjmg_senha` — fallback: campo com label "Senha"
4. Clique em `#sbmEntrar` ou `input[type="submit"]` — fallback: botão com texto "Entrar"

### Busca do processo:

1. No menu lateral, localize "Consultar Processo" ou use o campo de busca no topo
   - Fallback: elemento com texto "Consultar Processo" ou "Pesquisar"
2. Insira o número CNJ no campo `#txtNumProcesso` ou equivalente
   - Fallback: campo com placeholder ou label contendo "processo"
3. Clique em pesquisar/consultar
4. Clique no processo listado

### Extração de documentos:

1. Acesse a aba "Autos Digitais" ou "Documentos"
   - Fallback: aba ou link com texto "Autos", "Documentos" ou "Peças"
2. Identifique documentos com data correspondente às movimentações recentes (Etapa 4)
3. Clique em "Visualizar" ou no ícone de cada documento
4. Aguarde carregamento do PDF/texto inline
5. Extraia via `document.body.innerText` ou seletor do container de texto
6. Para PDFs embutidos: use `get_page_text` do Claude in Chrome após o PDF carregar

### Detecção de CAPTCHA:

- Elementos: `.captcha-box`, `#imgCaptcha`, reCAPTCHA iframe
- Mensagens de sessão expirada ou bloqueio também contam — trate como CAPTCHA

---

## Sistema 3: Eproc TRF6

**URL de login:** `https://eproc.trf6.jus.br/eproc/login.php`

### Fluxo de login:

1. Navegue até a URL de login
2. Preencha `#txtEntradaLogin` com `eproc_trf6_usuario` — fallback: campo com label "Usuário"
3. Preencha `#txtEntradaSenha` com `eproc_trf6_senha` — fallback: campo com label "Senha"
4. Clique em `#sbmEntrar` — fallback: botão com texto "Entrar"

> O Eproc TRF6 tem interface muito similar ao Eproc TJMG (mesma base de sistema).
> Os seletores CSS são geralmente idênticos. Tente os mesmos seletores do TJMG primeiro.

### Busca e extração:

- Idêntico ao Eproc TJMG acima.
- Atenção: o número CNJ federal tem formato diferente no segmento (`5` no campo de
  competência: ex. `0001234-56.2024.4.06.3800`).

---

## Dicas Gerais de Browser Automation

- **Timeout padrão:** aguarde até 15 segundos por elemento antes de declarar erro.
- **Seletor não encontrado:** sempre tente o fallback por texto visível antes de registrar erro.
- **Sessão expirada:** se após login for redirecionado para a tela de login novamente,
  tente uma segunda vez com as mesmas credenciais. Se falhar de novo, registre como erro.
- **Popups/modais de boas-vindas:** feche qualquer modal/aviso inicial antes de prosseguir
  (botão "Fechar", "OK", "Continuar", ou tecla Escape).
- **Múltiplas abas:** prefira trabalhar na mesma aba sempre que possível.
- **Rate limiting:** aguarde 2 segundos entre processos no mesmo sistema para evitar bloqueios.
