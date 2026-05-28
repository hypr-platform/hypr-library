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
        """
        UPSERT real via MERGE:
        - Insere decks novos
        - Atualiza metadata de decks existentes (título, owner, dates, etc)
        - Remove decks que sumiram do Drive (também limpa content e embeddings)
        Decks que continuam existindo MANTÊM seus embeddings — não reprocessa.
        """
        if not rows:
            log.warning("upsert_metadata: 0 rows recebidos, abortando.")
            return

        # 1. Carrega para tabela staging temporária (sobrescreve)
        staging = f"{self.tbl_meta}_staging"
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            schema=[
                bigquery.SchemaField("deck_id", "STRING", "REQUIRED"),
                bigquery.SchemaField("client", "STRING", "REQUIRED"),
                bigquery.SchemaField("title", "STRING", "REQUIRED"),
                bigquery.SchemaField("drive_url", "STRING"),
                bigquery.SchemaField("thumbnail_url", "STRING"),
                bigquery.SchemaField("owner_name", "STRING"),
                bigquery.SchemaField("owner_email", "STRING"),
                bigquery.SchemaField("size_bytes", "INT64"),
                bigquery.SchemaField("created_time", "TIMESTAMP"),
                bigquery.SchemaField("modified_time", "TIMESTAMP"),
                bigquery.SchemaField("mime_type", "STRING"),
                bigquery.SchemaField("client_folder_id", "STRING"),
                bigquery.SchemaField("synced_at", "TIMESTAMP", "REQUIRED"),
            ],
        )
        load = self.client.load_table_from_json(rows, staging, job_config=job_config)
        load.result()
        log.info(f"[Metadata] {len(rows)} rows carregados em staging.")

        # 2. MERGE: insert/update existentes
        merge_sql = f"""
        MERGE `{self.tbl_meta}` T
        USING `{staging}` S
        ON T.deck_id = S.deck_id
        WHEN MATCHED THEN UPDATE SET
          client = S.client,
          title = S.title,
          drive_url = S.drive_url,
          thumbnail_url = S.thumbnail_url,
          owner_name = S.owner_name,
          owner_email = S.owner_email,
          size_bytes = S.size_bytes,
          created_time = S.created_time,
          modified_time = S.modified_time,
          mime_type = S.mime_type,
          client_folder_id = S.client_folder_id,
          synced_at = S.synced_at
        WHEN NOT MATCHED THEN INSERT (
          deck_id, client, title, drive_url, thumbnail_url,
          owner_name, owner_email, size_bytes, created_time, modified_time,
          mime_type, client_folder_id, synced_at
        ) VALUES (
          S.deck_id, S.client, S.title, S.drive_url, S.thumbnail_url,
          S.owner_name, S.owner_email, S.size_bytes, S.created_time, S.modified_time,
          S.mime_type, S.client_folder_id, S.synced_at
        )
        """
        self.client.query(merge_sql).result()
        log.info("[Metadata] MERGE concluído (insert + update)")

        # 3. Identifica decks que sumiram do Drive (em metadata mas não em staging)
        # e remove de TODAS as 3 tabelas (cascading delete manual)
        delete_meta = f"""
        DELETE FROM `{self.tbl_meta}`
        WHERE deck_id NOT IN (SELECT deck_id FROM `{staging}`)
        """
        delete_content = f"""
        DELETE FROM `{self.tbl_content}`
        WHERE deck_id NOT IN (SELECT deck_id FROM `{staging}`)
        """
        delete_emb = f"""
        DELETE FROM `{self.tbl_emb}`
        WHERE deck_id NOT IN (SELECT deck_id FROM `{staging}`)
        """

        for sql, label in [
            (delete_emb, "embeddings"),
            (delete_content, "content"),
            (delete_meta, "metadata"),
        ]:
            result = self.client.query(sql).result()
            log.info(f"[Metadata] Limpeza {label}: {result.num_dml_affected_rows or 0} linhas removidas")

        # 4. Limpa staging
        self.client.query(f"TRUNCATE TABLE `{staging}`").result()
        log.info("[Metadata] Staging limpo.")

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

    def list_recent_decks(self, limit: int = 20) -> list[dict]:
        """Lista os N decks mais recentes da biblioteca (qualquer cliente)."""
        query = f"""
        SELECT
          deck_id, client, title,
          drive_url, thumbnail_url,
          owner_name, owner_email,
          size_bytes, modified_time, mime_type
        FROM `{self.tbl_meta}`
        WHERE modified_time IS NOT NULL
        ORDER BY modified_time DESC
        LIMIT @lim
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("lim", "INT64", limit)]
        )
        rows = self.client.query(query, job_config=job_config).result()
        return [self._row_to_deck(r) for r in rows]

    def get_library_stats(self) -> dict:
        """Estatísticas resumidas da biblioteca toda — pra dashboard."""
        query = f"""
        SELECT
          COUNT(DISTINCT client) AS total_clients,
          COUNT(*) AS total_decks,
          SUM(size_bytes) AS total_bytes,
          MAX(modified_time) AS most_recent
        FROM `{self.tbl_meta}`
        """
        rows = list(self.client.query(query).result())
        if not rows:
            return {"total_clients": 0, "total_decks": 0, "total_gb": 0, "most_recent": None}
        r = rows[0]
        total_bytes = int(r["total_bytes"] or 0)
        return {
            "total_clients": int(r["total_clients"] or 0),
            "total_decks": int(r["total_decks"] or 0),
            "total_gb": round(total_bytes / (1024 ** 3), 1),
            "most_recent": r["most_recent"].isoformat() if r["most_recent"] else None,
        }

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
