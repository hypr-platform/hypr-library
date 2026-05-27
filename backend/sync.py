"""
Sync orchestrator: lê tudo do Drive, popula o BigQuery.

Roda em 4 fases:
  1. Lista clientes (pastas raiz)
  2. Lista decks de cada cliente
  3. Extrai texto + gera embedding de cada deck
  4. Persiste tudo no BigQuery

Custo aproximado por execução completa:
  - Drive API: gratuita
  - Vertex AI: ~R$ 5-10 para ~1000 decks
  - BigQuery storage: ~R$ 0,50/mês
  - BigQuery query: dentro do free tier

Tempo aproximado: 30-90 min pra biblioteca completa (1000 decks).
Em runs incrementais futuros, otimizar pra só processar deltas.
"""
import logging
import re
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("biblioteca.sync")


def _clean_title(raw_title: str) -> str:
    """Normaliza títulos."""
    return raw_title.strip()


def _extract_size_bytes(size_str: Optional[str]) -> int:
    """Drive retorna size como string em bytes."""
    if not size_str:
        return 0
    try:
        return int(size_str)
    except (ValueError, TypeError):
        return 0


def _parse_drive_time(t: Optional[str]) -> Optional[str]:
    """Drive retorna ISO 8601. BigQuery aceita direto."""
    return t


def run_full_sync(drive, bq, embedder, root_folder_id: str) -> dict:
    """
    Sync completo: Drive → BigQuery.
    Retorna dict com estatísticas pra logging/monitoring.
    """
    started = datetime.now(timezone.utc)
    stats = {
        "started_at": started.isoformat(),
        "clients_found": 0,
        "decks_found": 0,
        "decks_indexed": 0,
        "decks_failed": 0,
        "errors": [],
    }

    # ============================================================
    # FASE 1+2: Lista todos decks
    # ============================================================
    log.info(f"[Sync] Iniciando — root folder: {root_folder_id}")

    all_decks = []  # lista de (client_name, drive_file_meta)
    clients_seen = set()

    for client_name, file in drive.iter_all_decks(root_folder_id):
        all_decks.append((client_name, file))
        clients_seen.add(client_name)

    stats["clients_found"] = len(clients_seen)
    stats["decks_found"] = len(all_decks)
    log.info(f"[Sync] {len(clients_seen)} clientes, {len(all_decks)} decks totais")

    # ============================================================
    # FASE 3: Extrai texto + gera embeddings
    # ============================================================
    log.info("[Sync] Extraindo texto e gerando embeddings...")

    metadata_rows = []
    content_rows = []
    embedding_rows = []

    # Coleta textos primeiro (pra embedar em batch)
    texts_to_embed = []
    decks_for_embed = []

    for client_name, file in all_decks:
        deck_id = file["id"]
        try:
            # Extração de texto
            text = drive.extract_text(deck_id, file["mimeType"])

            # Combina título + conteúdo (título tem peso alto)
            search_text = f"{file['name']}\n{file['name']}\n{text}"

            owner = (file.get("owners") or [{}])[0]

            metadata_rows.append({
                "deck_id": deck_id,
                "client": client_name,
                "title": _clean_title(file["name"]),
                "drive_url": file.get("webViewLink"),
                "thumbnail_url": file.get("thumbnailLink"),
                "owner_name": owner.get("displayName"),
                "owner_email": owner.get("emailAddress"),
                "size_bytes": _extract_size_bytes(file.get("size")),
                "modified_time": _parse_drive_time(file.get("modifiedTime")),
                "mime_type": file["mimeType"],
                "client_folder_id": file.get("_client_folder_id"),
                "synced_at": started.isoformat(),
            })

            content_rows.append({
                "deck_id": deck_id,
                "client": client_name,
                "full_text": text[:50_000],  # cap a 50k chars
                "text_length": len(text),
                "extracted_at": started.isoformat(),
            })

            texts_to_embed.append(search_text)
            decks_for_embed.append((deck_id, client_name))

        except Exception as e:
            log.exception(f"[Sync] Falha em {deck_id}: {e}")
            stats["decks_failed"] += 1
            stats["errors"].append({"deck_id": deck_id, "error": str(e)[:200]})

    # ============================================================
    # FASE 4a: Embeddings em batch
    # ============================================================
    log.info(f"[Sync] Gerando embeddings de {len(texts_to_embed)} decks...")
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
        stats["decks_indexed"] = len(embedding_rows)
    except Exception as e:
        log.exception("[Sync] Embedding em batch falhou")
        stats["errors"].append({"phase": "embedding", "error": str(e)[:500]})

    # ============================================================
    # FASE 4b: Persiste no BigQuery
    # ============================================================
    log.info("[Sync] Salvando no BigQuery...")
    try:
        bq.upsert_metadata(metadata_rows)
        bq.upsert_content(content_rows)
        bq.upsert_embeddings(embedding_rows)
    except Exception as e:
        log.exception("[Sync] Persist em BQ falhou")
        stats["errors"].append({"phase": "bigquery_write", "error": str(e)[:500]})
        raise

    ended = datetime.now(timezone.utc)
    stats["ended_at"] = ended.isoformat()
    stats["duration_seconds"] = (ended - started).total_seconds()

    log.info(
        f"[Sync] CONCLUÍDO — {stats['decks_indexed']}/{stats['decks_found']} indexados, "
        f"{stats['duration_seconds']:.0f}s, {stats['decks_failed']} falharam"
    )
    return stats
