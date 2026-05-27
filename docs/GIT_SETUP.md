# Como conectar GitHub + Vercel

Guia rápido pra subir o repo e configurar auto-deploy.

## 1. Verifica o que NÃO vai pro Git

Antes de qualquer commit, confirma que arquivos sensíveis estão ignorados:

```bash
cd hypr-library/
git init
git status
```

Você deve ver listados:
- `README.md`
- `.gitignore`
- `vercel.json`
- `backend/` (apenas .py, .sh, requirements.txt, README.md)
- `frontend/` (apenas src/, package.json, configs, README.md)
- `docs/SETUP.md`

❌ Você **NÃO** deve ver:
- Nenhum `.json` que não seja `package.json`, `tsconfig.json`, `vercel.json`
- Nenhum `.env.local` ou `.env`
- Nenhum arquivo de credencial
- Nenhum `node_modules/`
- Nenhum `__pycache__/`
- Nenhum `dist/`

Se vir algo suspeito, **PARA AGORA** e ajusta o `.gitignore`.

## 2. Cria o repo no GitHub

1. Vai em https://github.com/new
2. Owner: **conta/org HYPR**
3. Repository name: **`hypr-library`**
4. Description: *Internal audience discovery library with semantic search*
5. **Public** (sua escolha)
6. **NÃO inicializa com README** (já temos um)
7. **NÃO adiciona .gitignore** (já temos)
8. **NÃO adiciona license** (por enquanto)
9. **Create repository**

## 3. Conecta o repo local ao remoto

Na pasta `hypr-library/`:

```bash
git add .
git commit -m "Initial commit: backend + frontend monorepo"
git branch -M main
git remote add origin https://github.com/SUA_ORG/hypr-library.git
git push -u origin main
```

## 4. Conecta Vercel ao repo

1. Vai em https://vercel.com/new
2. **Import Git Repository** → seleciona `hypr-library`
3. **Configure Project:**
   - **Project Name:** `hypr-library`
   - **Framework Preset:** `Vite` (deve detectar automaticamente)
   - **Root Directory:** `./` (deixa raiz, o `vercel.json` redireciona pra `frontend/`)
   - **Build Command:** `cd frontend && npm install && npm run build` (deve vir do vercel.json)
   - **Output Directory:** `frontend/dist`
   - **Install Command:** `echo 'Skip root install'`

4. **Environment Variables** — adiciona as 3:

| Name | Value |
|---|---|
| `VITE_API_URL` | URL da Cloud Function (preencher depois do deploy do backend) |
| `VITE_GOOGLE_CLIENT_ID` | `453955675457-f3kq1mc8bnucge5tn222nb6tjuobh4gh.apps.googleusercontent.com` |
| `VITE_ALLOWED_HD` | `hypr.mobi` |

5. **Deploy**

O primeiro deploy vai falhar se você ainda não tem o `VITE_API_URL` (porque o backend não foi deployado). Tudo bem — o frontend vai buildar, só não vai conseguir conectar com o backend.

## 5. Próximos passos

1. Deploy do backend (cd backend && ./deploy.sh)
2. Pega o URL da Cloud Function
3. Volta no Vercel → Project Settings → Environment Variables → atualiza `VITE_API_URL`
4. Redeploy (Vercel → Deployments → ⋮ → Redeploy)

## 6. Domínio custom (opcional)

Pra usar `biblioteca.hypr.mobi`:

1. No Vercel: Project Settings → Domains → Add
2. Digita `biblioteca.hypr.mobi`
3. Vercel vai dar instruções de DNS:
   - Tipo: `CNAME`
   - Name: `biblioteca`
   - Value: `cname.vercel-dns.com`
4. Adiciona esse registro no provedor de DNS do `hypr.mobi`
5. Espera propagar (5-30 min)
6. Vercel emite SSL automaticamente

---

## Auto-deploy futuro

Daqui pra frente, qualquer push pra `main` faz Vercel redeployar automaticamente:

```bash
# Editou algo no frontend?
git add frontend/
git commit -m "feat: ajustou cor do card"
git push
# → Vercel rebuilda e deployа automaticamente em ~2 min
```

PRs (Pull Requests) ganham preview deploys com URLs únicas.
