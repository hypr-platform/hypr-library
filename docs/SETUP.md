# Biblioteca HYPR · Setup de Produção

Guia completo de implementação. Siga na ordem.

**Estimativa de tempo total:** 90 minutos (setup) + 30 minutos (deploy)

---

## Arquitetura

```
[Pasta Drive: Audience Discovery]
       ↓ compartilhada com
[Service Account: biblioteca-hypr@site-hypr.iam.gserviceaccount.com]
       ↓ Drive API + Vertex AI
[Cloud Function: biblioteca_data (southamerica-east1)]
       ↓
[BigQuery: site-hypr.biblioteca dataset]
   ├── decks_metadata        ← lista de todos decks
   ├── decks_embeddings       ← vetores semânticos
   └── decks_content          ← texto extraído pra reindex
       ↓ HTTPS REST
[Frontend React/Vite: biblioteca.hypr.mobi]
       ↓ Google OAuth (hd=hypr.mobi)
[Vendedores HYPR]
```

---

## ETAPA 1 — Criar a Service Account (5 min)

### 1.1 Acessa o GCP Console

Vai em https://console.cloud.google.com/iam-admin/serviceaccounts?project=site-hypr

### 1.2 Cria a SA

Clica em **+ Create Service Account** e preenche:

- **Name:** `biblioteca-hypr`
- **Service account ID:** `biblioteca-hypr` (auto)
- **Description:** `Acesso a Drive (Audience Discovery) e Vertex AI para Biblioteca HYPR`

Clica em **Create and Continue**.

### 1.3 Adiciona roles

Na tela de roles, adiciona:

- `Vertex AI User` (pra gerar embeddings)
- `BigQuery Data Editor` (pra escrever na tabela de embeddings)
- `BigQuery Job User` (pra executar queries)
- `Cloud Functions Invoker` (pra Function autenticada)

Clica em **Continue** → **Done**.

### 1.4 Cria a JSON key

Na lista de SAs, clica nos 3 pontinhos da `biblioteca-hypr` → **Manage keys** → **Add Key** → **Create new key** → **JSON**.

**Salva o arquivo `.json` localmente.** Vamos chamar de `sa-biblioteca-hypr.json` daqui pra frente.

> ⚠️ Esse arquivo é uma credencial sensível. Não comita no git. Não compartilha. Trate como senha.

### 1.5 Anota o e-mail da SA

No formato: `biblioteca-hypr@site-hypr.iam.gserviceaccount.com`

---

## ETAPA 2 — Compartilhar a pasta do Drive com a SA (2 min)

### 2.1 Abre a pasta no Drive

URL: https://drive.google.com/drive/folders/1JFqbYViL8xyOFGyGF9yy4bwveRgfG37f

### 2.2 Compartilha

Clica no botão **Compartilhar** (canto superior direito).

Cola o e-mail da SA: `biblioteca-hypr@site-hypr.iam.gserviceaccount.com`

Permissão: **Viewer** (Visualizador). Desmarca "Notificar pessoas" (não precisa enviar e-mail pra uma SA).

Clica em **Enviar**.

### 2.3 Confirma

Recarrega a lista de compartilhamentos. A SA deve aparecer como "biblioteca-hypr" (sem foto, com ícone de robô).

---

## ETAPA 3 — Habilitar APIs no GCP (3 min)

Acessa cada link e clica em **Enable** se não estiver habilitado:

- Drive API: https://console.cloud.google.com/apis/library/drive.googleapis.com?project=site-hypr
- Vertex AI API: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=site-hypr
- BigQuery API: https://console.cloud.google.com/apis/library/bigquery.googleapis.com?project=site-hypr
- Cloud Functions API: https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=site-hypr
- Cloud Build API: https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=site-hypr

---

## ETAPA 4 — Criar o dataset BigQuery (5 min)

### 4.1 Cria o dataset

Abre o BigQuery Console: https://console.cloud.google.com/bigquery?project=site-hypr

No painel Explorer, clica nos 3 pontos do projeto `site-hypr` → **Create dataset**.

- **Dataset ID:** `biblioteca`
- **Location:** `southamerica-east1` (mesma região da Cloud Function)
- **Default table expiration:** None

Clica em **Create dataset**.

### 4.2 Cria as tabelas

No Editor SQL, cola e executa:

```sql
-- Metadata dos decks (atualizado a cada sync)
CREATE TABLE `site-hypr.biblioteca.decks_metadata` (
  deck_id STRING NOT NULL,
  client STRING NOT NULL,
  title STRING NOT NULL,
  drive_url STRING,
  thumbnail_url STRING,
  owner_name STRING,
  owner_email STRING,
  size_bytes INT64,
  modified_time TIMESTAMP,
  mime_type STRING,
  client_folder_id STRING,
  synced_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(synced_at)
CLUSTER BY client;

-- Conteúdo textual extraído (pra reindex e debug)
CREATE TABLE `site-hypr.biblioteca.decks_content` (
  deck_id STRING NOT NULL,
  client STRING NOT NULL,
  full_text STRING,
  text_length INT64,
  extracted_at TIMESTAMP NOT NULL
)
CLUSTER BY deck_id;

-- Embeddings vetoriais (pra busca semântica)
CREATE TABLE `site-hypr.biblioteca.decks_embeddings` (
  deck_id STRING NOT NULL,
  client STRING NOT NULL,
  embedding ARRAY<FLOAT64> NOT NULL,
  model_version STRING NOT NULL,
  embedded_at TIMESTAMP NOT NULL
)
CLUSTER BY deck_id;

-- Index vetorial pra VECTOR_SEARCH performático
CREATE VECTOR INDEX biblioteca_embeddings_idx
ON `site-hypr.biblioteca.decks_embeddings`(embedding)
OPTIONS(index_type = 'IVF', distance_type = 'COSINE');
```

> ⚠️ O `VECTOR INDEX` precisa de pelo menos 5000 linhas pra ser criado. Se sua biblioteca tiver menos, executa o resto sem essa última declaração. Vai funcionar via cálculo direto via `ML.DISTANCE` até atingir esse volume.

---

## ETAPA 5 — Configurar OAuth para login do frontend (10 min)

### 5.1 Cria OAuth Client ID

Vai em: https://console.cloud.google.com/apis/credentials?project=site-hypr

Clica em **+ Create Credentials** → **OAuth client ID**.

- **Application type:** Web application
- **Name:** `Biblioteca HYPR Frontend`
- **Authorized JavaScript origins:**
  - `http://localhost:5173` (dev)
  - `https://biblioteca.hypr.mobi` (prod)
- **Authorized redirect URIs:**
  - `http://localhost:5173`
  - `https://biblioteca.hypr.mobi`

Clica em **Create**.

### 5.2 Anota o Client ID

Vai aparecer um modal. **Copia o Client ID** (algo como `123456789-abc...xyz.apps.googleusercontent.com`).

Esse é público, vai no código do frontend. Não precisa do Client Secret (frontend SPA não usa).

### 5.3 Configura restrição de domínio

No próprio frontend (vamos fazer no código), passamos o parâmetro `hd=hypr.mobi` na requisição OAuth. Mas pra dupla camada de segurança, vai no **OAuth consent screen** e configura:

- User Type: Internal (se o GCP é parte do Workspace hypr.mobi)
- Ou External + adiciona @hypr.mobi como domínio autorizado

---

## ETAPA 6 — Deploy do backend (Cloud Function)

Os arquivos do backend estão em `backend/`. Veja `backend/DEPLOY.md` pro passo a passo.

Resumo:

```bash
cd backend/
gcloud functions deploy biblioteca_data \
  --gen2 \
  --runtime=python311 \
  --region=southamerica-east1 \
  --source=. \
  --entry-point=biblioteca_data \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512Mi \
  --timeout=540s \
  --service-account=biblioteca-hypr@site-hypr.iam.gserviceaccount.com \
  --set-env-vars=GCP_PROJECT=site-hypr,DRIVE_ROOT_FOLDER_ID=1JFqbYViL8xyOFGyGF9yy4bwveRgfG37f,BQ_DATASET=biblioteca,ALLOWED_HD=hypr.mobi,OAUTH_CLIENT_ID=SEU_CLIENT_ID_AQUI
```

---

## ETAPA 7 — Rodar o sync inicial

Depois do deploy, executa uma vez pra popular o BigQuery com os decks da pasta:

```bash
# Pega o URL da function que apareceu no output do deploy
FUNCTION_URL=$(gcloud functions describe biblioteca_data --region=southamerica-east1 --gen2 --format='value(serviceConfig.uri)')

# Trigger do sync (precisa do token de admin que tá no env var SYNC_SECRET)
curl -X POST "$FUNCTION_URL/sync" \
  -H "Authorization: Bearer $SYNC_SECRET" \
  -H "Content-Type: application/json"
```

Esse sync vai:
1. Listar todas pastas-cliente na raiz `Audience Discovery`
2. Listar todos arquivos Slides em cada pasta
3. Salvar metadata no BigQuery
4. Extrair texto de cada deck
5. Gerar embedding via Vertex AI
6. Salvar embedding no BigQuery

**Tempo estimado:** 30-90 min na primeira vez (depende de quantos decks). Roda em background como Cloud Scheduler job depois.

---

## ETAPA 8 — Deploy do frontend (Netlify)

```bash
cd frontend/
npm install
npm run build

# Arrasta a pasta dist/ no Netlify Drop: https://app.netlify.com/drop
```

Depois configura o domínio custom `biblioteca.hypr.mobi` no Netlify e aponta o DNS.

---

## ETAPA 9 — Configurar reindex automático (opcional, 5 min)

Pra manter a biblioteca atualizada quando novos decks forem adicionados ao Drive:

### Cloud Scheduler

```bash
gcloud scheduler jobs create http biblioteca-resync \
  --location=southamerica-east1 \
  --schedule="0 6 * * *" \
  --uri="$FUNCTION_URL/sync" \
  --http-method=POST \
  --headers="Authorization=Bearer $SYNC_SECRET" \
  --time-zone="America/Sao_Paulo"
```

Isso vai resincronizar todo dia às 6h da manhã. Pode ajustar pra hora/frequência que preferir.

---

## Checklist final

Antes de considerar o sistema "no ar":

- [ ] Service account criada e baixei a JSON key
- [ ] Pasta do Drive compartilhada com SA
- [ ] APIs habilitadas (Drive, Vertex AI, BigQuery, Functions, Build)
- [ ] Dataset `biblioteca` criado com as 3 tabelas
- [ ] OAuth Client ID criado e copiado
- [ ] Cloud Function deployada com sucesso
- [ ] Sync inicial executado (verificar contagem em `decks_metadata`)
- [ ] Frontend buildado e deployado no Netlify
- [ ] DNS `biblioteca.hypr.mobi` apontando pro Netlify
- [ ] OAuth login funciona apenas com @hypr.mobi
- [ ] Cloud Scheduler configurado pra resync

---

## Custos estimados (mensal)

- **Cloud Function:** ~R$ 0 (free tier cobre uso interno)
- **BigQuery storage:** ~R$ 0,50 (poucos MB de embeddings)
- **BigQuery queries:** ~R$ 0 (queries pequenas, free tier 1TB/mês)
- **Vertex AI embeddings:** ~R$ 5 no setup inicial (1000 decks × $0.000025/1k chars) + R$ 1/mês manutenção
- **Drive API:** R$ 0 (gratuita)
- **Netlify:** R$ 0 (free tier)

**Total estimado: R$ 6-10/mês** para a biblioteca toda funcionando.

---

## Troubleshooting comum

**"Permission denied" ao acessar Drive**
→ Verifica se a SA tem acesso à pasta e se a Drive API está habilitada.

**"Quota exceeded" no Drive**
→ Drive API tem rate limit de 1000 requests/100sec. Adicione backoff exponencial (já está no código).

**Embeddings demorando muito**
→ Vertex AI tem rate limit. O código já processa em batches de 5 com retry.

**OAuth funciona mas usuário não-hypr consegue entrar**
→ Frontend valida `hd=hypr.mobi` no token. Backend revalida via `ALLOWED_HD` env var.

**Cloud Function timeout**
→ O sync inicial pode demorar muito. Use `--timeout=540s` (9 min, max permitido). Pra bibliotecas maiores, rode o sync localmente uma vez via script standalone.
