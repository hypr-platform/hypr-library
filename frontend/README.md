# Frontend · HYPR Library

React 19 + Vite 7 SPA. Deployed to Vercel.

## Setup local

```bash
npm install
cp .env.example .env.local
# Edita .env.local com o URL do backend (Cloud Function)
npm run dev
# → http://localhost:5173
```

## Env vars

| Variable | Description | Public? |
|---|---|---|
| `VITE_API_URL` | URL da Cloud Function backend | Yes |
| `VITE_GOOGLE_CLIENT_ID` | OAuth Client ID | Yes |
| `VITE_ALLOWED_HD` | Workspace domain (default: `hypr.mobi`) | Yes |

Todas as variáveis com `VITE_` viram públicas no bundle final — não coloque secrets aqui.

## Build

```bash
npm run build
# → dist/
```

## Deploy

Auto-deployed via Vercel ao fazer push na branch `main`.

Pra ambientes preview, Vercel cria URLs únicas que **não funcionam com OAuth** (não estão na lista de origins autorizados). Pra testar mudanças locais, usa `npm run dev`.

## Estrutura

```
src/
├── App.jsx               # Componente raiz
├── main.jsx              # Entry point + OAuth provider
├── index.css             # Tailwind + custom utilities
├── components/
│   ├── HyprLogo.jsx
│   ├── LoginScreen.jsx
│   ├── Sidebar.jsx
│   ├── SmartSearchBar.jsx
│   ├── DeckCard.jsx
│   └── PreviewModal.jsx
├── hooks/
│   ├── useAuth.js        # Google OAuth + hd validation
│   └── useTheme.js       # Dark/light mode
└── lib/
    ├── api.js            # Backend HTTP client
    ├── icons.jsx         # Inline SVG icons
    └── utils.js          # gradientFor, cleanTitle, etc.
```
