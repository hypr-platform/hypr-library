# Backend · Biblioteca HYPR

Cloud Function Python que serve a Biblioteca HYPR. Roda em `southamerica-east1` no projeto `site-hypr`.

## Configuração (já pré-preenchida)

| Variável | Valor |
|---|---|
| `GCP_PROJECT` | `site-hypr` |
| `DRIVE_ROOT_FOLDER_ID` | `1JFqbYViL8xyOFGyGF9yy4bwveRgfG37f` |
| `BQ_DATASET` | `biblioteca` |
| `ALLOWED_HD` | `hypr.mobi` |
| `OAUTH_CLIENT_ID` | `453955675457-f3kq1mc8bnucge5tn222nb6tjuobh4gh.apps.googleusercontent.com` |
| `SERVICE_ACCOUNT` | `biblioteca-hypr@site-hypr.iam.gserviceaccount.com` |

## Deploy

### Opção 1: Script automatizado (recomendado)

```bash
cd backend/
./deploy.sh
```

O script vai gerar um `SYNC_SECRET` aleatório, fazer o deploy, e te dar o URL da Function ao final.

### Opção 2: Comando manual (se preferir controle total)

```bash
# Gera um secret pro endpoint /sync
SYNC_SECRET=$(openssl rand -hex 32)
echo "Guarda este secret: $SYNC_SECRET"

# Deploy
gcloud functions deploy biblioteca_data \
  --gen2 \
  --runtime=python311 \
  --region=southamerica-east1 \
  --project=site-hypr \
  --source=. \
  --entry-point=biblioteca_data \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512Mi \
  --timeout=540s \
  --service-account=biblioteca-hypr@site-hypr.iam.gserviceaccount.com \
  --set-env-vars="GCP_PROJECT=site-hypr,DRIVE_ROOT_FOLDER_ID=1JFqbYViL8xyOFGyGF9yy4bwveRgfG37f,BQ_DATASET=biblioteca,ALLOWED_HD=hypr.mobi,OAUTH_CLIENT_ID=453955675457-f3kq1mc8bnucge5tn222nb6tjuobh4gh.apps.googleusercontent.com,SYNC_SECRET=$SYNC_SECRET"
```

## Após o deploy

### Pega o URL da Function

```bash
gcloud functions describe biblioteca_data \
  --region=southamerica-east1 \
  --gen2 \
  --format='value(serviceConfig.uri)'
```

Vai retornar algo como:
```
https://biblioteca-data-xxx-rj.a.run.app
```

**Anota esse URL** — vai ser usado no frontend.

### Testa o health check

```bash
curl https://<URL_DA_FUNCTION>/health
# → {"status": "ok", "service": "biblioteca-hypr"}
```

### Roda o sync inicial

```bash
FUNCTION_URL="https://<URL_DA_FUNCTION>"
curl -X POST "$FUNCTION_URL/sync" \
  -H "Authorization: Bearer $SYNC_SECRET"
```

**⚠️ Atenção:** o sync inicial pode demorar até 9 minutos (timeout máximo da Function). Pra bibliotecas grandes, considera rodar localmente uma vez.

### (Opcional) Agenda resync diário

```bash
gcloud scheduler jobs create http biblioteca-resync \
  --location=southamerica-east1 \
  --schedule="0 6 * * *" \
  --uri="$FUNCTION_URL/sync" \
  --http-method=POST \
  --headers="Authorization=Bearer $SYNC_SECRET" \
  --time-zone="America/Sao_Paulo"
```

## Endpoints

| Método | Path | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | público | Health check |
| GET | `/clients` | OAuth @hypr.mobi | Lista clientes |
| GET | `/decks?client=X` | OAuth @hypr.mobi | Decks de um cliente |
| GET | `/deck/{id}` | OAuth @hypr.mobi | Metadata de 1 deck |
| POST | `/search` | OAuth @hypr.mobi | Busca semântica |
| GET | `/tags?category=X` | OAuth @hypr.mobi | Facetas de tags (`solucao`, `feature`, `audiencia`) com nº de decks |
| GET | `/tags/decks?tag=X&client=Y` | OAuth @hypr.mobi | Decks que têm a tag, com os slides onde aparece |
| GET | `/deck/{id}/tags` | OAuth @hypr.mobi | Tags por slide de 1 deck |
| POST | `/sync` | Bearer SYNC_SECRET | Trigger reindex |
| POST | `/sync/metadata` | Bearer SYNC_SECRET | Fase 1: lista pastas + decks |
| POST | `/sync/embeddings` | Bearer SYNC_SECRET | Fase 2: texto + embedding + tags (batch) |
| POST | `/sync/tags` | Bearer SYNC_SECRET | Fase 3: backfill/re-tag por slide (batch) |
| GET | `/sync/status` | público | Progresso (inclui `tags_pending`) |

### Tags por slide (`tagging.py`)

Cada slide recebe tags em três categorias:

- **solucao** — core product mostrado no slide: `O2O`, `OOH Amplifier`, `RMN Digital`, `GroundFlow · NF-e / Split + Lift / Signals / Patterns`, `HYPR Metadata`, `Explorer`, `Mapeamento de places`…
- **feature** — complemento: `Brand Lift Survey`, `PDOOH`, `Downloaded Apps`, `Tap To Map`, `Match Content`, `Free Form`, `Click-to-Calendar`, `Dynamic Ads`, `Max Attention`…
- **audiencia** — nome do cluster como aparece no slide: `Luxo recorrente`, `Fluxo rodoviário`, `Decisores de Marketing`, `Varejo de Bairro`…

Soluções/features são regex sobre o texto normalizado (`TAXONOMY`). Audiências usam Gemini
(`TAGGING_MODEL`, default `gemini-2.0-flash`) só nos slides de audiência; se o LLM falhar ou
`TAGGING_USE_LLM=0`, cai numa heurística de layout (linha de título acima da volumetria).

Teste offline sem GCP: `python tagging.py deck.txt` (slides separados por linha `-----`).

## Desenvolvimento local

```bash
pip install -r requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS=~/credentials/sa-biblioteca-hypr.json
export GCP_PROJECT=site-hypr
export DRIVE_ROOT_FOLDER_ID=1JFqbYViL8xyOFGyGF9yy4bwveRgfG37f
export BQ_DATASET=biblioteca
export ALLOWED_HD=hypr.mobi
export OAUTH_CLIENT_ID=453955675457-f3kq1mc8bnucge5tn222nb6tjuobh4gh.apps.googleusercontent.com
export SYNC_SECRET=teste123

functions-framework --target=biblioteca_data --debug
# Server em http://localhost:8080
```

Test local:
```bash
curl http://localhost:8080/health
curl -X POST http://localhost:8080/sync -H "Authorization: Bearer teste123"
```
