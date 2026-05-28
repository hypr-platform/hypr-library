"""
BigQuery wrapper para Biblioteca HYPR.
Schema definido em docs/SETUP.md (ETAPA 4).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from google.cloud import bigquery

log = logging.getLogger("biblioteca.bq")


class BigQueryClient:
    def __init__(self, project: str, dataset: str):
        self.project = project
        self.dataset = dataset
        self.client = bigquery.Client(project=project)
        self.tbl_meta = f"{project}.{dataset}.decks_metadata"
        self.tbl_content = f"{project}.{dataset}.decks_content"
        self.tbl_emb = f"{project}.{dataset}.decks_embeddings"

    # ============================================================
    # WRITE OPERATIONS (usado pelo sync)
    # ============================================================
    def upsert_metadata(self, rows: list[dict]):
        """Substitui metadata: trunca a tabela e insere tudo do zero."""
        if not rows:
            return

        # Estratégia simples: MERGE com staging temporária
        # Em produção, considera streaming inserts pra incremental
        staging_id = f"{self.tbl_meta}_staging"

        # Delete + insert (mais simples que MERGE em prod)
        self.client.query(f"TRUNCATE TABLE `{self.tbl_meta}`").result()
        errors = self.client.insert_rows_json(self.tbl_meta, rows)
        if errors:
            raise RuntimeError(f"Erro ao inserir metadata: {errors}")
        log.info(f"Inseridos {len(rows)} decks em metadata")

    def upsert_content(self, rows: list[dict]):
        if not rows:
            return
        self.client.query(f"TRUNCATE TABLE `{self.tbl_content}`").result()
        errors = self.client.insert_rows_json(self.tbl_content, rows)
        if errors:
            raise RuntimeError(f"Erro ao inserir content: {errors}")
        log.info(f"Inseridos {len(rows)} textos em content")

    def upsert_embeddings(self, rows: list[dict]):
        if not rows:
            return
        self.client.query(f"TRUNCATE TABLE `{self.tbl_emb}`").result()
        # Embeddings têm que ir via load_table_from_json por causa do ARRAY<FLOAT64>
        job = self.client.load_table_from_json(rows, self.tbl_emb)
        job.result()
        log.info(f"Inseridos {len(rows)} embeddings")

    # ============================================================
    # INCREMENTAL OPERATIONS (sync por batches)
    # ============================================================
    def append_content(self, rows: list[dict]):
        """Adiciona conteúdo incremental sem truncar a tabela."""
        if not rows:
            return
        errors = self.client.insert_rows_json(self.tbl_content, rows)
        if errors:
            raise RuntimeError(f"Erro ao inserir content (append): {errors}")
        log.info(f"Append: {len(rows)} novos textos em content")

    def append_embeddings(self, rows: list[dict]):
        """Adiciona embeddings incremental via load job (suporta ARRAY)."""
        if not rows:
            return
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        job = self.client.load_table_from_json(rows, self.tbl_emb, job_config=job_config)
        job.result()
        log.info(f"Append: {len(rows)} novos embeddings")

    def list_decks_without_embeddings(self, limit: int = 30) -> list[dict]:
        """Retorna decks que ainda não foram embedados."""
        query = f"""
        SELECT m.deck_id, m.client, m.title, m.mime_type
        FROM `{self.tbl_meta}` m
        LEFT JOIN `{self.tbl_emb}` e ON m.deck_id = e.deck_id
        WHERE e.deck_id IS NULL
        ORDER BY m.modified_time DESC
        LIMIT @lim
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("lim", "INT64", limit)]
        )
        rows = self.client.query(query, job_config=job_config).result()
        return [dict(r) for r in rows]

    def count_decks_without_embeddings(self) -> int:
        query = f"""
        SELECT COUNT(*) AS cnt
        FROM `{self.tbl_meta}` m
        LEFT JOIN `{self.tbl_emb}` e ON m.deck_id = e.deck_id
        WHERE e.deck_id IS NULL
        """
        rows = list(self.client.query(query).result())
        return int(rows[0]["cnt"]) if rows else 0

    def count_decks_with_embeddings(self) -> int:
        query = f"SELECT COUNT(*) AS cnt FROM `{self.tbl_emb}`"
        rows = list(self.client.query(query).result())
        return int(rows[0]["cnt"]) if rows else 0

    def count_total_decks(self) -> int:
        query = f"SELECT COUNT(*) AS cnt FROM `{self.tbl_meta}`"
        rows = list(self.client.query(query).result())
        return int(rows[0]["cnt"]) if rows else 0

    def count_distinct_clients(self) -> int:
        query = f"SELECT COUNT(DISTINCT client) AS cnt FROM `{self.tbl_meta}`"
        rows = list(self.client.query(query).result())
        return int(rows[0]["cnt"]) if rows else 0

    # ============================================================
    # READ OPERATIONS (usado pelos endpoints)
    # ============================================================
    def list_clients(self) -> list[dict]:
        """Lista distintos clientes com contagem de decks."""
        query = f"""
        SELECT
          client,
          COUNT(*) AS deck_count,
          MAX(modified_time) AS last_modified
        FROM `{self.tbl_meta}`
        GROUP BY client
        ORDER BY client
        """
        rows = self.client.query(query).result()
        return [
            {
                "name": r["client"],
                "deck_count": r["deck_count"],
                "last_modified": r["last_modified"].isoformat() if r["last_modified"] else None,
            }
            for r in rows
        ]

    def list_decks_for_client(self, client: str) -> list[dict]:
        """Lista decks de 1 cliente."""
        query = f"""
        SELECT
          deck_id, client, title,
          drive_url, thumbnail_url,
          owner_name, owner_email,
          size_bytes, modified_time, mime_type
        FROM `{self.tbl_meta}`
        WHERE client = @client
        ORDER BY modified_time DESC
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("client", "STRING", client),
            ]
        )
        rows = self.client.query(query, job_config=job_config).result()
        return [self._row_to_deck(r) for r in rows]

    def get_deck(self, deck_id: str) -> Optional[dict]:
        """Metadata de 1 deck."""
        query = f"""
        SELECT
          deck_id, client, title,
          drive_url, thumbnail_url,
          owner_name, owner_email,
          size_bytes, modified_time, mime_type
        FROM `{self.tbl_meta}`
        WHERE deck_id = @deck_id
        LIMIT 1
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("deck_id", "STRING", deck_id),
            ]
        )
        rows = list(self.client.query(query, job_config=job_config).result())
        if not rows:
            return None
        return self._row_to_deck(rows[0])

    def search_by_embedding(
        self,
        query_embedding: list[float],
        client_filter: Optional[str] = None,
        limit: int = 20,
    ) -> list[dict]:
        """
        Busca semântica via cosine distance.
        Usa VECTOR_SEARCH se o index existir, fallback pra ML.DISTANCE.
        """
        # Tenta VECTOR_SEARCH primeiro (mais performático, requer índice)
        try:
            return self._vector_search(query_embedding, client_filter, limit)
        except Exception as e:
            log.warning(f"VECTOR_SEARCH falhou ({e}), fallback pra ML.DISTANCE")
            return self._distance_search(query_embedding, client_filter, limit)

    def _vector_search(self, query_embedding, client_filter, limit):
        """
        Busca usando VECTOR_SEARCH (requer índice criado).
        Estratégia: pega top K candidatos pela similaridade semântica,
        depois ordena por data (mais novo primeiro) na resposta final.
        """
        filter_clause = ""
        params = [
            bigquery.ArrayQueryParameter("query_emb", "FLOAT64", query_embedding),
            bigquery.ScalarQueryParameter("k", "INT64", limit),
        ]
        if client_filter:
            filter_clause = "WHERE base.client = @client"
            params.append(bigquery.ScalarQueryParameter("client", "STRING", client_filter))

        query = f"""
        WITH base AS (
          SELECT e.deck_id, e.client, e.embedding
          FROM `{self.tbl_emb}` e
        )
        SELECT
          m.deck_id, m.client, m.title,
          m.drive_url, m.thumbnail_url,
          m.owner_name, m.size_bytes, m.modified_time, m.mime_type,
          vs.distance AS distance,
          (1 - vs.distance) AS score
        FROM VECTOR_SEARCH(
          (SELECT * FROM base {filter_clause}),
          'embedding',
          (SELECT @query_emb AS embedding),
          top_k => @k,
          distance_type => 'COSINE'
        ) vs
        JOIN `{self.tbl_meta}` m ON m.deck_id = vs.base.deck_id
        ORDER BY m.modified_time DESC NULLS LAST, vs.distance ASC
        """
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        rows = self.client.query(query, job_config=job_config).result()
        return [self._row_to_search_result(r) for r in rows]

    def _distance_search(self, query_embedding, client_filter, limit):
        """
        Fallback: cálculo direto de cosine distance via ML.DISTANCE.
        Mesma estratégia: filtra os top K relevantes, ordena por data.
        """
        filter_clause = "WHERE 1=1"
        params = [
            bigquery.ArrayQueryParameter("query_emb", "FLOAT64", query_embedding),
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
        ]
        if client_filter:
            filter_clause += " AND e.client = @client"
            params.append(bigquery.ScalarQueryParameter("client", "STRING", client_filter))

        query = f"""
        WITH candidates AS (
          SELECT
            m.deck_id, m.client, m.title,
            m.drive_url, m.thumbnail_url,
            m.owner_name, m.size_bytes, m.modified_time, m.mime_type,
            ML.DISTANCE(e.embedding, @query_emb, 'COSINE') AS distance,
            (1 - ML.DISTANCE(e.embedding, @query_emb, 'COSINE')) AS score
          FROM `{self.tbl_emb}` e
          JOIN `{self.tbl_meta}` m ON m.deck_id = e.deck_id
          {filter_clause}
          ORDER BY distance ASC
          LIMIT @limit
        )
        SELECT * FROM candidates
        ORDER BY modified_time DESC NULLS LAST, distance ASC
        """
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        rows = self.client.query(query, job_config=job_config).result()
        return [self._row_to_search_result(r) for r in rows]

    # ============================================================
    # HELPERS
    # ============================================================
    def _row_to_deck(self, r) -> dict:
        return {
            "deck_id": r["deck_id"],
            "client": r["client"],
            "title": r["title"],
            "drive_url": r["drive_url"],
            "thumbnail_url": r["thumbnail_url"],
            "owner_name": r["owner_name"],
            "owner_email": r.get("owner_email"),
            "size_bytes": r["size_bytes"],
            "modified_time": r["modified_time"].isoformat() if r["modified_time"] else None,
            "mime_type": r["mime_type"],
        }

    def _row_to_search_result(self, r) -> dict:
        d = self._row_to_deck(r)
        d["score"] = float(r["score"]) if r["score"] is not None else 0.0
        d["distance"] = float(r["distance"]) if r["distance"] is not None else 1.0
        return d
