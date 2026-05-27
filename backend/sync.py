"""
Sync incremental para Biblioteca HYPR.

A biblioteca tem 1800+ decks distribuídos em 600+ pastas-cliente.
Sync completo levaria 3-4 horas, mas Cloud Functions tem timeout máximo
de 9 minutos. Solução: dividir em fases pequenas, cada uma cabe no timeout.

Endpoints:
  POST /sync/metadata     → Lista todas pastas + decks no Drive, salva metadata.
                            Roda 1 vez. Tempo: ~2-3 min.

  POST /sync/embeddings   → Processa N decks ainda sem embedding (default 30).
                            Pode rodar várias vezes. Tempo: ~2-4 min por batch.

  GET  /sync/status       → Mostra progresso (X de Y decks indexados).

Estratégia de resumo:
- Cada batch escreve no BigQuery antes de retornar.
- Se der timeout/erro, a próxima chamada continua do ponto que parou.
- Cloud Scheduler chama /sync/embeddings a cada 2 min até completar.
"""
import logging
from datetime import datetime, timezone

log = logging.getLogger("biblioteca.sync")

# Tamanho de batch para embeddings — equilibra timeout vs throughput
EMBEDDING_BATCH_SIZE = 30


def _extract_size_bytes(size_str):
    if not size_str:
        return 0
    try:
        return int(size_str)
    except (ValueError, TypeError):
        return 0


# ============================================================
# FASE 1: METADATA
# ============================================================
def sync_metadata(drive, bq, root_folder_id: str) -> dict:
    """
    Lista todas as pastas-cliente e decks no Drive, salva metadata no BigQuery.
    Não extrai texto nem gera embedding. Roda em 2-3 minutos.
    """
    started = datetime.now(timezone.utc)
    log.info(f"[Metadata] Iniciando — root: {root_folder_id}")

    metadata_rows = []
    clients_seen = set()

    for client_name, file in drive.iter_all_decks(root_folder_id):
        clients_seen.add(client_name)
        owner = (file.get("owners") or [{}])[0]

        metadata_rows.append({
            "deck_id": file["id"],
            "client": client_name,
            "title": file["name"].strip(),
            "drive_url": file.get("webViewLink"),
            "thumbnail_url": file.get("thumbnailLink"),
            "owner_name": owner.get("displayName"),
            "owner_email": owner.get("emailAddress"),
            "size_bytes": _extract_size_bytes(file.get("size")),
            "modified_time": file.get("modifiedTime"),
            "mime_type": file["mimeType"],
            "client_folder_id": file.get("_client_folder_id"),
            "synced_at": started.isoformat(),
        })

    log.info(f"[Metadata] {len(clients_seen)} clientes, {len(metadata_rows)} decks. Salvando no BigQuery...")
    bq.upsert_metadata(metadata_rows)

    ended = datetime.now(timezone.utc)
    return {
        "phase": "metadata",
        "started_at": started.isoformat(),
        "ended_at": ended.isoformat(),
        "duration_seconds": (ended - started).total_seconds(),
        "clients_found": len(clients_seen),
        "decks_found": len(metadata_rows),
    }


# ============================================================
# FASE 2: EMBEDDINGS (incremental)
# ============================================================
def sync_embeddings_batch(drive, bq, embedder, batch_size: int = EMBEDDING_BATCH_SIZE) -> dict:
    """
    Processa próximo batch de decks que ainda não têm embedding.
    Retorna estatísticas + se há mais trabalho pendente.
    """
    started = datetime.now(timezone.utc)

    # Pega decks que ainda não foram embedados
    pending = bq.list_decks_without_embeddings(limit=batch_size)
    if not pending:
        log.info("[Embeddings] Sem decks pendentes. Sync completo!")
        return {
            "phase": "embeddings",
            "processed": 0,
            "remaining": 0,
            "complete": True,
            "duration_seconds": 0,
        }

    log.info(f"[Embeddings] Processando batch de {len(pending)} decks...")

    content_rows = []
    embedding_rows = []
    failed = []
    texts_to_embed = []
    decks_for_embed = []

    for deck in pending:
        deck_id = deck["deck_id"]
        client_name = deck["client"]
        try:
            text = drive.extract_text(deck_id, deck["mime_type"])
            # Combina título + conteúdo (peso maior pro título)
            title = deck["title"]
            search_text = f"{title}\n{title}\n{text}"

            content_rows.append({
                "deck_id": deck_id,
                "client": client_name,
                "full_text": text[:50_000],
                "text_length": len(text),
                "extracted_at": started.isoformat(),
            })

            texts_to_embed.append(search_text)
            decks_for_embed.append((deck_id, client_name))

        except Exception as e:
            log.exception(f"[Embeddings] Falha em {deck_id} ({client_name}): {e}")
            failed.append({"deck_id": deck_id, "client": client_name, "error": str(e)[:200]})

    # Gera embeddings em batch (Vertex AI)
    if texts_to_embed:
        log.info(f"[Embeddings] Gerando {len(texts_to_embed)} embeddings via Vertex AI...")
        try:
            embeddings = embedder.embed_documents_batch(texts_to_embed)
            for (deck_id, client_name), emb in zip(decks_for_embed, embeddings):
                embedding_rows.append({
                    "deck_id": deck_id,
                    "client": client_name,
                    "embedding": emb,
                    "model_version": "text-multilingual-embedding-002",
                    "embedded_at": started.isoformat(),
                })
        except Exception as e:
            log.exception(f"[Embeddings] Falha no batch Vertex AI: {e}")
            failed.append({"phase": "embedding_batch", "error": str(e)[:500]})

    # Persiste incremental no BigQuery
    if content_rows:
        bq.append_content(content_rows)
    if embedding_rows:
        bq.append_embeddings(embedding_rows)

    remaining = bq.count_decks_without_embeddings()
    ended = datetime.now(timezone.utc)

    return {
        "phase": "embeddings",
        "started_at": started.isoformat(),
        "ended_at": ended.isoformat(),
        "duration_seconds": (ended - started).total_seconds(),
        "processed": len(embedding_rows),
        "failed": len(failed),
        "remaining": remaining,
        "complete": remaining == 0,
        "errors": failed[:10],  # Retorna só os primeiros 10 erros
    }


# ============================================================
# STATUS
# ============================================================
def sync_status(bq) -> dict:
    """Retorna progresso do sync."""
    total_decks = bq.count_total_decks()
    with_embedding = bq.count_decks_with_embeddings()
    without_embedding = total_decks - with_embedding
    total_clients = bq.count_distinct_clients()

    return {
        "total_clients": total_clients,
        "total_decks": total_decks,
        "embedded": with_embedding,
        "pending": without_embedding,
        "progress_pct": round((with_embedding / total_decks * 100), 2) if total_decks > 0 else 0,
        "complete": without_embedding == 0 and total_decks > 0,
    }


# ============================================================
# LEGACY ENTRY POINT (mantém compatibilidade com o /sync original)
# ============================================================
def run_full_sync(drive, bq, embedder, root_folder_id: str) -> dict:
    """
    DEPRECATED: roda metadata + um batch de embeddings.
    Pra completar o sync, chame /sync/embeddings várias vezes
    ou configure Cloud Scheduler.
    """
    meta_result = sync_metadata(drive, bq, root_folder_id)
    emb_result = sync_embeddings_batch(drive, bq, embedder)
    return {
        "deprecated": "Use /sync/metadata e /sync/embeddings separadamente",
        "metadata": meta_result,
        "embeddings_first_batch": emb_result,
        "next_step": "POST /sync/embeddings repetidas vezes até remaining=0, ou configure Cloud Scheduler",
    }
