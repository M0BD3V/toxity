# Toxity

Aplicativo desktop de comunicação com foco em calls e compartilhamento de tela.

## Desenvolvimento

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
npm run dist:win
```

O instalador é gravado em `release/Toxity Setup <versão>.exe`. Em máquinas onde o Windows Defender bloqueia por alguns segundos a extração do Electron, o script monta automaticamente um pacote completo com `Toxity.exe`, recursos da aplicação e metadados da marca.

O primeiro marco contém a shell Electron, a interface React navegável e a identidade visual. Autenticação, persistência e mídia em tempo real serão conectadas aos serviços de backend nos próximos marcos.

A base de autenticação, dados em tempo real e mídia está em `src/lib`, com migração e função segura em `supabase/`. Consulte [BACKEND_SETUP.md](BACKEND_SETUP.md) para conectar os serviços gerenciados.
