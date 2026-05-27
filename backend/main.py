"""
Biblioteca HYPR - Cloud Function Backend
=========================================
Endpoints:
  GET  /health                  - Health check
  GET  /clients                 - Lista clientes (pastas da raiz)
  GET  /decks?client=X          - Lista decks de um cliente
  GET  /deck/{deck_id}          - Metadata + preview URL de 1 deck
  POST /search                  - Busca semântica { query: str, client?: str, limit?: int }
  POST /sync                    - Trigger reindex (autenticado via SYNC_SECRET)

Auth: Frontend envia Google ID token em `Authorization: Bearer <token>`.
      Função valida token contra OAUTH_CLIENT_ID e exige hd=hypr.mobi.

Deploy: ver docs/SETUP.md
"""
import os
import json
import logging
from datetime import datetime, timezone

import functions_framework
from flask import jsonify, request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from drive_client import DriveClient
from bigquery_client import BigQueryClient
from embeddings import EmbeddingGenerator
from sync import run_full_sync

# ============================================================
# CONFIG
# ============================================================
GCP_PROJECT = os.environ["GCP_PROJECT"]
DRIVE_ROOT_FOLDER_ID = os.environ["DRIVE_ROOT_FOLDER_ID"]
BQ_DATASET = os.environ.get("BQ_DATASET", "biblioteca")
ALLOWED_HD = os.environ.get("ALLOWED_HD", "hypr.mobi")
OAUTH_CLIENT_ID = os.environ["OAUTH_CLIENT_ID"]
SYNC_SECRET = os.environ.get("SYNC_SECRET", "")  # Pra autenticar trigger de sync
REGION = "southamerica-east1"

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://hypr-library.vercel.app",
    "https://biblioteca.hypr.mobi",
]

# Setup logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("biblioteca")

# Clients (lazy-loaded singletons)
_drive_client = None
_bq_client = None
_embedding_gen = None


def get_drive():
    global _drive_client
    if _drive_client is None:
        _drive_client = DriveClient()
    return _drive_client


def get_bq():
    global _bq_client
    if _bq_client is None:
        _bq_client = BigQueryClient(project=GCP_PROJECT, dataset=BQ_DATASET)
    return _bq_client


def get_embedder():
    global _embedding_gen
    if _embedding_gen is None:
        _embedding_gen = EmbeddingGenerator(project=GCP_PROJECT, location=REGION)
    return _embedding_gen


# ============================================================
# AUTH
# ============================================================
def verify_user_token(req):
    """
    Verifica o Google ID token enviado pelo frontend.
    Retorna dict com info do usuário, ou None se inválido.
    """
    auth_header = req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1]
    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            OAUTH_CLIENT_ID,
        )

        # Restringe a usuários do domínio HYPR
        if idinfo.get("hd") != ALLOWED_HD:
            log.warning(
                f"Login bloqueado: domínio inválido ({idinfo.get('hd')}) "
                f"para {idinfo.get('email')}"
            )
            return None

        return {
            "email": idinfo.get("email"),
            "name": idinfo.get("name"),
            "picture": idinfo.get("picture"),
            "hd": idinfo.get("hd"),
        }
    except Exception as e:
        log.warning(f"Token inválido: {e}")
        return None


def verify_sync_secret(req):
    """Autentica o trigger de sync (uso interno via Cloud Scheduler)."""
    if not SYNC_SECRET:
        return False
    auth_header = req.headers.get("Authorization", "")
    return auth_header == f"Bearer {SYNC_SECRET}"


# ============================================================
# CORS
# ============================================================
def cors_headers(origin):
    if origin in ALLOWED_ORIGINS:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "3600",
        }
    return {}


def json_response(data, status=200, origin=None):
    return Response(
        json.dumps(data, default=str, ensure_ascii=False),
        status=status,
        mimetype="application/json",
        headers=cors_headers(origin) if origin else {},
    )


# ============================================================
# ROUTES
# ============================================================
@functions_framework.http
def biblioteca_data(req):
    """Single entry point. Routes by path."""
    origin = req.headers.get("Origin", "")

    # CORS preflight
    if req.method == "OPTIONS":
        return ("", 204, cors_headers(origin))

    path = req.path.rstrip("/")
    log.info(f"{req.method} {path} from {origin}")

    # Health (público)
    if path == "/health" or path == "":
        return json_response({"status": "ok", "service": "biblioteca-hypr"}, origin=origin)

    # Sync (autenticado via secret)
    if path == "/sync" and req.method == "POST":
        if not verify_sync_secret(req):
            return json_response({"error": "unauthorized"}, 401, origin)
        try:
            result = run_full_sync(
                drive=get_drive(),
                bq=get_bq(),
                embedder=get_embedder(),
                root_folder_id=DRIVE_ROOT_FOLDER_ID,
            )
            return json_response(result, origin=origin)
        except Exception as e:
            log.exception("Sync failed")
            return json_response({"error": str(e)}, 500, origin)

    # ---- Endpoints autenticados (Google login @hypr.mobi) ----
    user = verify_user_token(req)
    if not user:
        return json_response({"error": "unauthorized", "hint": "Login com conta @hypr.mobi"}, 401, origin)

    # Clientes
    if path == "/clients" and req.method == "GET":
        clients = get_bq().list_clients()
        return json_response({"clients": clients}, origin=origin)

    # Decks por cliente
    if path == "/decks" and req.method == "GET":
        client_name = req.args.get("client")
        if not client_name:
            return json_response({"error": "client required"}, 400, origin)
        decks = get_bq().list_decks_for_client(client_name)
        return json_response({"client": client_name, "decks": decks}, origin=origin)

    # Detalhe de 1 deck
    if path.startswith("/deck/") and req.method == "GET":
        deck_id = path.split("/", 2)[2]
        deck = get_bq().get_deck(deck_id)
        if not deck:
            return json_response({"error": "deck not found"}, 404, origin)
        return json_response({"deck": deck}, origin=origin)

    # Busca semântica
    if path == "/search" and req.method == "POST":
        body = req.get_json(silent=True) or {}
        query = body.get("query", "").strip()
        client_filter = body.get("client")
        limit = int(body.get("limit", 20))

        if not query:
            return json_response({"error": "query required"}, 400, origin)

        try:
            query_embedding = get_embedder().embed_query(query)
            results = get_bq().search_by_embedding(
                query_embedding=query_embedding,
                client_filter=client_filter,
                limit=limit,
            )
            return json_response({
                "query": query,
                "client_filter": client_filter,
                "results": results,
                "count": len(results),
            }, origin=origin)
        except Exception as e:
            log.exception("Search failed")
            return json_response({"error": str(e)}, 500, origin)

    return json_response({"error": "not found", "path": path}, 404, origin)
