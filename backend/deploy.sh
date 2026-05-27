#!/bin/bash
# Deploy script para Biblioteca HYPR Cloud Function
# Uso: ./deploy.sh

set -e

# ===== CONFIGURAÇÃO — EDITAR ANTES DE RODAR =====
PROJECT=site-hypr
REGION=southamerica-east1
FUNCTION_NAME=biblioteca_data
SERVICE_ACCOUNT="biblioteca-hypr@${PROJECT}.iam.gserviceaccount.com"
DRIVE_ROOT_FOLDER_ID="1JFqbYViL8xyOFGyGF9yy4bwveRgfG37f"
OAUTH_CLIENT_ID_DEFAULT="453955675457-f3kq1mc8bnucge5tn222nb6tjuobh4gh.apps.googleusercontent.com"

# Gera um SYNC_SECRET aleatório se não definido
if [ -z "$SYNC_SECRET" ]; then
  echo "⚠️  SYNC_SECRET não definido. Gerando um aleatório..."
  SYNC_SECRET=$(openssl rand -hex 32)
  echo "Use este token pra chamar /sync:"
  echo "  $SYNC_SECRET"
  echo ""
  echo "Salve em algum lugar (1Password, .env local). Não comita."
  read -p "Pressione ENTER pra continuar..."
fi

# OAuth Client ID (do passo 5 do SETUP.md)
if [ -z "$OAUTH_CLIENT_ID" ]; then
  OAUTH_CLIENT_ID="$OAUTH_CLIENT_ID_DEFAULT"
  echo "✓ Usando OAuth Client ID padrão: $OAUTH_CLIENT_ID"
fi

# ===== DEPLOY =====
echo "🚀 Deploying ${FUNCTION_NAME} to ${REGION}..."

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime=python311 \
  --region="$REGION" \
  --project="$PROJECT" \
  --source=. \
  --entry-point=biblioteca_data \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512Mi \
  --timeout=540s \
  --service-account="$SERVICE_ACCOUNT" \
  --set-env-vars="GCP_PROJECT=${PROJECT},DRIVE_ROOT_FOLDER_ID=${DRIVE_ROOT_FOLDER_ID},BQ_DATASET=biblioteca,ALLOWED_HD=hypr.mobi,OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID},SYNC_SECRET=${SYNC_SECRET}"

# Pega o URL
FUNCTION_URL=$(gcloud functions describe "$FUNCTION_NAME" \
  --region="$REGION" --gen2 \
  --format='value(serviceConfig.uri)')

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "URL da function:"
echo "  $FUNCTION_URL"
echo ""
echo "Pra rodar o sync inicial:"
echo "  curl -X POST '$FUNCTION_URL/sync' -H 'Authorization: Bearer $SYNC_SECRET'"
echo ""
echo "Pra adicionar Cloud Scheduler (resync diário às 6h):"
echo "  gcloud scheduler jobs create http biblioteca-resync \\"
echo "    --location=$REGION \\"
echo "    --schedule='0 6 * * *' \\"
echo "    --uri='$FUNCTION_URL/sync' \\"
echo "    --http-method=POST \\"
echo "    --headers='Authorization=Bearer $SYNC_SECRET' \\"
echo "    --time-zone='America/Sao_Paulo'"
