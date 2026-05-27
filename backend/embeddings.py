"""
Vertex AI embeddings wrapper para Biblioteca HYPR.

Modelo: text-embedding-005 (multilíngue, 768 dimensões)
Cobra ~$0.000025 por 1k chars. Custo total estimado: < R$ 10/setup.
"""
import logging
import time
from typing import Optional

from google.cloud import aiplatform
from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput

log = logging.getLogger("biblioteca.emb")

# Modelo multilíngue - importante para PT-BR misturado com EN nos decks
MODEL_NAME = "text-multilingual-embedding-002"  # 768d, suporta PT/EN/ES
MAX_CHARS = 20_000  # Trunca textos longos
BATCH_SIZE = 5     # Vertex tem rate limit


class EmbeddingGenerator:
    def __init__(self, project: str, location: str = "southamerica-east1"):
        aiplatform.init(project=project, location=location)
        # Vertex AI region: text-multilingual disponível em us-central1 e algumas outras
        # Pra southamerica-east1, usa text-embedding-005
        try:
            self.model = TextEmbeddingModel.from_pretrained(MODEL_NAME)
        except Exception:
            log.warning("Modelo multilingual indisponível, fallback pra text-embedding-005")
            self.model = TextEmbeddingModel.from_pretrained("text-embedding-005")

    def embed_query(self, query: str) -> list[float]:
        """Embedding de uma query de busca (otimizado para retrieval)."""
        text = query.strip()[:MAX_CHARS]
        inp = TextEmbeddingInput(text=text, task_type="RETRIEVAL_QUERY")
        result = self._embed_with_retry([inp])
        return result[0]

    def embed_document(self, text: str) -> list[float]:
        """Embedding de 1 documento."""
        clean = text.strip()[:MAX_CHARS]
        if not clean:
            return [0.0] * 768
        inp = TextEmbeddingInput(text=clean, task_type="RETRIEVAL_DOCUMENT")
        result = self._embed_with_retry([inp])
        return result[0]

    def embed_documents_batch(self, texts: list[str]) -> list[list[float]]:
        """Embedding em batch (mais eficiente)."""
        if not texts:
            return []

        all_embeddings = []
        # Vertex permite até 5 textos por chamada
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            inputs = [
                TextEmbeddingInput(
                    text=(t.strip()[:MAX_CHARS] if t.strip() else " "),
                    task_type="RETRIEVAL_DOCUMENT",
                )
                for t in batch
            ]
            embeddings = self._embed_with_retry(inputs)
            all_embeddings.extend(embeddings)
            log.info(f"  Embedded {min(i + BATCH_SIZE, len(texts))}/{len(texts)}")
        return all_embeddings

    def _embed_with_retry(self, inputs, max_retries=4):
        """Retry com backoff exponencial."""
        for attempt in range(max_retries):
            try:
                response = self.model.get_embeddings(inputs)
                return [r.values for r in response]
            except Exception as e:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt
                    log.warning(f"Embedding falhou ({e}), retry em {wait}s")
                    time.sleep(wait)
                else:
                    raise
        raise RuntimeError("Embeddings falhou após retries")
