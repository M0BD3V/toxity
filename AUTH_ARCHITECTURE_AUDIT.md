# Auditoria da autenticação — 2026-08-19

## Estado encontrado

- `src/lib/supabase.ts`: cria o cliente Supabase com `persistSession`, `autoRefreshToken` e `detectSessionInUrl` habilitados. A persistência padrão do Supabase Auth é permitida por decisão do produto; a aplicação não acessa nem manipula os tokens.
- `src/lib/auth.ts`: reúne cadastro, confirmação por OTP, reenvio, login, recuperação, atualização de senha e logout. Havia processamento manual parcial de links de recuperação.
- `src/AuthGate.tsx`: protege o conteúdo autenticado e renderiza as telas de login, cadastro, confirmação e recuperação. Os estados de recuperação estavam separados dos estados de sessão.
- `electron/main.cjs`: controla janela, bandeja, IPC de desktop e tinha suporte parcial a instância única/deep link.
- `electron/preload.cjs`: expõe APIs de desktop e listener de deep link.
- `src/vite-env.d.ts`: continha declarações duplicadas de `Window.toxity`.
- `src/App.tsx` e `src/lib/call.ts`: usam armazenamento local somente para preferências de interface/áudio/stickers; não criam armazenamento próprio de autenticação.
- `package.json`: Vite + TypeScript + Electron 43 + Electron Builder/NSIS.

## Decisão de armazenamento

É permitido o armazenamento de sessão gerenciado internamente pelo Supabase Auth, inclusive o mecanismo padrão usado pelo cliente para restaurar a sessão. A Toxity não criará, lerá, copiará, moverá, interpretará ou transportará tokens, JWTs ou refresh tokens.

## Escopo preservado

Funcionalidades de chamadas, mensagens, grupos, presença, captura de tela, bandeja e preferências locais não relacionadas à autenticação serão preservadas.

## Configuração remota

Nenhuma configuração remota do Supabase foi alterada durante a auditoria. Templates, Site URL, Redirect URLs, confirmação de e-mail e PKCE deverão ser conferidos manualmente antes do teste real.
