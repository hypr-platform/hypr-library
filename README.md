# HYPR Library

> Internal audience discovery library with semantic search.
> A platform for HYPR MediaBrands sales team to browse and discover past audience research decks.

🚀 **Production:** [hypr-library.vercel.app](https://hypr-library.vercel.app)

---

## Overview

HYPR Library is an internal tool that surfaces past audience discovery research from the HYPR MediaBrands archive. It allows the sales team to:

- Browse decks organized by client
- Search the entire library by **semantic intent**, not just keywords (e.g., "premium runners" finds Adidas Running, Heineken F1, Itaú Personnalité decks)
- Preview decks inline before opening in Google Slides
- Access controlled by Google Workspace SSO

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Vite + React 19)                          │
│  hypr-library.vercel.app                             │
│  └─ Google OAuth (restricted to @hypr.mobi)          │
└──────────────────┬───────────────────────────────────┘
                   │ HTTPS REST
                   ▼
┌──────────────────────────────────────────────────────┐
│  Backend (Python · Cloud Functions Gen 2)            │
│  southamerica-east1                                  │
│  └─ Runs as service account with read-only Drive     │
└──────┬────────────────────┬──────────────────┬───────┘
       │                    │                  │
       ▼                    ▼                  ▼
┌─────────────┐    ┌──────────────────┐  ┌───────────┐
│  Drive API  │    │  Vertex AI       │  │ BigQuery  │
│  (read)     │    │  embeddings      │  │ (storage) │
└─────────────┘    └──────────────────┘  └───────────┘
```

### Tech stack

**Frontend**
- React 19 + Vite 7
- TypeScript
- Tailwind CSS
- Google Identity Services (OAuth)

**Backend**
- Python 3.11
- Google Cloud Functions (Gen 2)
- Google Drive API v3
- Vertex AI (text-multilingual-embedding-002)
- BigQuery (vector search via `ML.DISTANCE`)

**Infrastructure**
- GCP `southamerica-east1`
- Vercel (frontend hosting)
- Cloud Scheduler (daily reindex)

## Repository structure

```
.
├── backend/              # Python Cloud Function
│   ├── main.py           # HTTP routes & auth
│   ├── drive_client.py   # Drive API wrapper
│   ├── bigquery_client.py # BigQuery operations
│   ├── embeddings.py     # Vertex AI embeddings
│   ├── sync.py           # Reindex orchestrator
│   ├── deploy.sh         # Deployment script
│   └── README.md         # Backend docs
├── frontend/             # React SPA
│   ├── src/              # Components & logic
│   ├── public/           # Static assets
│   └── README.md         # Frontend docs
├── docs/
│   └── SETUP.md          # Full deployment guide
└── README.md             # This file
```

## Quick start

### Frontend (local dev)

```bash
cd frontend/
npm install
cp .env.example .env.local
# Edit .env.local with your backend URL
npm run dev
# → http://localhost:5173
```

### Backend (local dev)

```bash
cd backend/
pip install -r requirements.txt
# Authenticate as the service account
export GOOGLE_APPLICATION_CREDENTIALS=~/credentials/sa-biblioteca-hypr.json
# Set env vars (see backend/README.md)
functions-framework --target=biblioteca_data --debug
# → http://localhost:8080
```

## Deployment

### Frontend (auto-deploys on push to `main`)

Vercel is connected to this repo. Every push to `main` triggers a production deploy. PRs get preview deploys.

### Backend (manual deploy)

```bash
cd backend/
./deploy.sh
```

See [`docs/SETUP.md`](docs/SETUP.md) for full setup instructions.

## Access

Production access is restricted to **@hypr.mobi** Google Workspace accounts. The OAuth consent flow validates the `hd` (hosted domain) claim on the ID token.

## License

Internal HYPR MediaBrands project. All rights reserved.

---

Built with ☕ by the HYPR engineering team.
