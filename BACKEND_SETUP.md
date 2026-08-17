# Configuração do backend real da Toxity

## 1. Supabase

1. Crie um projeto no Supabase e copie `.env.example` para `.env`.
2. Preencha apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A chave pública pode estar no cliente porque todas as tabelas usam RLS.
3. No terminal, autentique e vincule o projeto:

```powershell
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

4. Em Authentication, habilite login por e-mail, confirmação de endereço e proteção contra senhas vazadas.
5. Adicione `toxity://reset-password` à lista de redirect URLs antes de testar recuperação no desktop.

## 2. LiveKit Cloud

1. Crie um projeto no LiveKit Cloud.
2. Copie a URL WebSocket, API key e API secret.
3. Nunca coloque a API secret no `.env` do Vite ou no Electron. Grave os três valores como secrets da função:

```powershell
npx supabase secrets set LIVEKIT_URL=wss://SEU-PROJETO.livekit.cloud
npx supabase secrets set LIVEKIT_API_KEY=SUA_CHAVE
npx supabase secrets set LIVEKIT_API_SECRET=SEU_SEGREDO
npx supabase functions deploy livekit-token
```

4. Preencha no `.env` local:

```text
VITE_LIVEKIT_TOKEN_ENDPOINT=https://SEU_PROJECT_REF.supabase.co/functions/v1/livekit-token
```

O endpoint exige o JWT do usuário e confirma que ele pertence ao grupo antes de emitir um token LiveKit de 15 minutos.

## 3. Teste entre dois usuários

1. Execute `npm run dev` em dois PCs ou em uma instalação e uma sessão de desenvolvimento.
2. Cadastre e confirme dois e-mails diferentes.
3. Crie um grupo, adicione o segundo usuário pelo nametag e envie mensagens nos dois sentidos.
4. Entre na call com ambos, valide microfone e câmera e inicie compartilhamento com áudio.

## Administração de senhas

- Senhas são processadas pelo Supabase Auth e armazenadas como hashes bcrypt com salt.
- Nem o proprietário da Toxity deve conseguir recuperar ou visualizar a senha original.
- A administração pode revogar sessões, banir contas ou disparar recuperação por e-mail.
- A recuperação permite definir uma nova senha mediante token temporário; ela não revela a senha anterior.
