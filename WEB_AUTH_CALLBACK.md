# Callback HTTPS da recuperação

O app já trata a rota `/reset-password` com o cliente Supabase. Para habilitar a recuperação real, publique o build web em qualquer hospedagem HTTPS gratuita.

## Deploy estático

1. Execute `npm run build`.
2. Publique a pasta `dist/` no Cloudflare Pages, Netlify ou Vercel.
3. Configure fallback/rewrite de qualquer rota para `index.html`.
4. Anote a URL pública, por exemplo `https://toxity.pages.dev`.
5. Use o callback:

```text
https://toxity.pages.dev/reset-password
```

6. Adicione essa URL no Supabase em `Authentication > URL Configuration > Redirect URLs`.
7. Defina localmente, sem commitar, no `.env`:

```env
VITE_TOXITY_AUTH_CALLBACK_URL=https://toxity.pages.dev/reset-password
```

8. Gere novamente o build e o instalador.

Não use `localhost` em produção. O Electron não processa tokens: o callback HTTPS é processado pelo Supabase Auth e o renderer reage ao evento `PASSWORD_RECOVERY`.

## Vercel

```powershell
npx vercel login
npx vercel --prod
```

Use `dist` como diretório publicado e configure o rewrite para `/index.html`.

## Cloudflare Pages

É possível fazer o deploy pelo painel com `dist/` como diretório de saída, sem custo para este uso inicial.

Nenhuma configuração remota do Supabase deve ser alterada sem confirmar primeiro a URL pública final.
