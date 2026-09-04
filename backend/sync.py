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
                            Também gera as tags por slide desses decks (tagging.py).

  POST /sync/tags         → Backfill: taggeia N decks que já têm metadata mas ainda
                            não têm tags (decks indexados antes do tagging existir,
                            ou re-tag após mudança na TAXONOMY). Default 20.

  GET  /sync/status       → Mostra progresso (X de Y decks indexados).

Estratégia de resumo:
- Cada batch escreve no BigQuery antes de retornar.
- Se der timeout/erro, a próxima chamada continua do ponto que parou.
- Cloud Scheduler chama /sync/embeddings a cada 2 min até completar.
"""
import logging
import re
from datetime import datetime, timezone

from tagging import tag_deck

log = logging.getLogger("biblioteca.sync")

# Tamanho de batch para embeddings — equilibra timeout vs throughput
EMBEDDING_BATCH_SIZE = 30
# Tagging chama o Gemini só nos slides de audiência (~5-8/deck); 20 decks cabem no timeout
TAGGING_BATCH_SIZE = 20


def _tag_one_deck(drive, deck_id: str, client_name: str, mime_type: str, full_text: str) -> list[dict]:
    """Extrai slides e gera tags. Nunca levanta exceção — tagging não pode derrubar o sync."""
    try:
        slides = drive.extract_slides(deck_id, mime_type, fallback_text=full_text)
        return tag_deck(deck_id, client_name, slides)
    except Exception as e:  # noqa: BLE001
        log.warning(f"[Tags] Falha em {deck_id} ({client_name}): {e}")
        return []


def _extract_size_bytes(size_str):
    if not size_str:
        return 0
    try:
        return int(size_str)
    except (ValueError, TypeError):
        return 0


# Títulos ignorados na indexação: cópias geradas pelo Drive ("Cópia de ...",
# "Copy of ..."). Como upsert_metadata apaga o que não vem no staging,
# decks já indexados com esses nomes somem de todas as tabelas no próximo sync.
_IGNORED_TITLE_RE = re.compile(r"^\s*(c[óo]pia\s+de|copy\s+of)\b", re.IGNORECASE)


def is_ignored_title(title: str) -> bool:
    return bool(_IGNORED_TITLE_RE.match(title or ""))


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
    ignored = 0

    for client_name, file in drive.iter_all_decks(root_folder_id):
        if is_ignored_title(file.get("name", "")):
            ignored += 1
            continue
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
            "created_time": file.get("createdTime"),
            "modified_time": file.get("modifiedTime"),
            "mime_type": file["mimeType"],
            "client_folder_id": file.get("_client_folder_id"),
            "synced_at": started.isoformat(),
        })

    log.info(f"[Metadata] {len(clients_seen)} clientes, {len(metadata_rows)} decks ({ignored} cópias ignoradas). Salvando no BigQuery...")
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
    tag_rows = []
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

            # Tags por slide (solução/feature + audiência) no mesmo batch
            tag_rows.extend(_tag_one_deck(drive, deck_id, client_name, deck["mime_type"], text))

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
    if tag_rows:
        try:
            bq.append_tags(tag_rows)
        except Exception as e:  # noqa: BLE001
            log.exception(f"[Tags] Falha ao gravar tags: {e}")

    remaining = bq.count_decks_without_embeddings()
    ended = datetime.now(timezone.utc)

    return {
        "phase": "embeddings",
        "started_at": started.isoformat(),
        "ended_at": ended.isoformat(),
        "duration_seconds": (ended - started).total_seconds(),
        "processed": len(embedding_rows),
        "tags_written": len(tag_rows),
        "failed": len(failed),
        "remaining": remaining,
        "complete": remaining == 0,
        "errors": failed[:10],  # Retorna só os primeiros 10 erros
    }


# ============================================================
# FASE 3: TAGS (backfill / re-tag)
# ============================================================
def sync_tags_batch(drive, bq, batch_size: int = TAGGING_BATCH_SIZE) -> dict:
    """
    Taggeia o próximo batch de decks sem tags. Idempotente por deck
    (replace_deck_tags). Pra re-taggear tudo após mudar a TAXONOMY:
        DELETE FROM decks_slide_tags WHERE TRUE;  → depois chama /sync/tags até remaining=0.
    """
    started = datetime.now(timezone.utc)
    pending = bq.list_decks_without_tags(limit=batch_size)
    if not pending:
        return {"phase": "tags", "processed": 0, "remaining": 0, "complete": True, "duration_seconds": 0}

    log.info(f"[Tags] Processando batch de {len(pending)} decks...")
    processed, written, failed = 0, 0, []
    for deck in pending:
        deck_id, client_name = deck["deck_id"], deck["client"]
        try:
            slides = drive.extract_slides(deck_id, deck["mime_type"])
            if not slides:
                text = drive.extract_text(deck_id, deck["mime_type"])
                slides = drive.extract_slides(deck_id, deck["mime_type"], fallback_text=text)
            rows = tag_deck(deck_id, client_name, slides)
            bq.replace_deck_tags(deck_id, rows)
            processed += 1
            written += len(rows)
        except Exception as e:  # noqa: BLE001
            log.exception(f"[Tags] Falha em {deck_id} ({client_name}): {e}")
            failed.append({"deck_id": deck_id, "client": client_name, "error": str(e)[:200]})

    remaining = bq.count_decks_without_tags()
    ended = datetime.now(timezone.utc)
    return {
        "phase": "tags",
        "started_at": started.isoformat(),
        "ended_at": ended.isoformat(),
        "duration_seconds": (ended - started).total_seconds(),
        "processed": processed,
        "tags_written": written,
        "failed": len(failed),
        "remaining": remaining,
        "complete": remaining == 0,
        "errors": failed[:10],
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
    try:
        without_tags = bq.count_decks_without_tags()
    except Exception:  # tabela ainda não criada
        without_tags = None

    return {
        "total_clients": total_clients,
        "total_decks": total_decks,
        "embedded": with_embedding,
        "pending": without_embedding,
        "tags_pending": without_tags,
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
