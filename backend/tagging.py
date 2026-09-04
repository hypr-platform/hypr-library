"""
Tagging por slide para Biblioteca HYPR.

Para cada slide de um deck gera tags em duas famílias:
  - solucao / feature : nome canônico do produto HYPR mostrado no slide
                        (O2O, OOH Amplifier, GroundFlow · Split + Lift, Brand Lift Survey...)
  - audiencia         : nome da audiência/cluster do slide
                        ("Luxo recorrente", "Fluxo rodoviário", "Decisores de Marketing"...)

Soluções e features têm vocabulário fechado → regras (determinístico, sem custo).
Audiências têm nome livre → Gemini (Vertex AI) com fallback heurístico, para que o
sync nunca dependa do LLM estar disponível.

Roda dentro do sync incremental (sync.py), no mesmo batch dos embeddings.
Resultado vai pra tabela `decks_slide_tags` (ver docs/SETUP.md).
"""
import json
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger("biblioteca.tagging")

TAGGING_MODEL = os.environ.get("TAGGING_MODEL", "gemini-2.0-flash")
TAGGING_USE_LLM = os.environ.get("TAGGING_USE_LLM", "1") not in ("0", "false", "False")

# ============================================================
# TAXONOMIA — tag canônica: (categoria, [regex sobre texto normalizado])
# Texto normalizado = minúsculo, sem acento, espaços colapsados.
# Pra adicionar uma feature nova: uma linha aqui, e o próximo /sync/tags reprocessa.
# ============================================================
TAXONOMY: dict[str, tuple[str, list[str]]] = {
    # ---- soluções / core products ----
    "O2O":                        ("solucao", [r"\bo2o\b"]),
    "OOH Amplifier":              ("solucao", [r"ooh amplifier", r"\bamplifier\b", r"jornada ooh",
                                                r"a cidade que essa audiencia atravessa"]),
    "RMN Digital":                ("solucao", [r"rmn digital"]),
    "GroundFlow · NF-e":          ("solucao", [r"\bnf-?e'?s?\b", r"nota fiscal"]),
    "GroundFlow · Arquitetura":   ("solucao", [r"groundflow.{0,40}arquitetura",
                                                r"location data.{0,200}consumption data"]),
    "GroundFlow · Split + Lift":  ("solucao", [r"split \+ lift", r"geo-?experiment"]),
    "GroundFlow · Signals":       ("solucao", [r"groundflow.{0,40}signals", r"market share.{0,20}signals"]),
    "GroundFlow · Patterns":      ("solucao", [r"groundflow.{0,40}patterns", r"cesta do consumidor"]),
    "HYPR Metadata":              ("solucao", [r"hypr metadata", r"locais mapeados no brasil"]),
    "Explorer":                   ("solucao", [r"\bexplorer\b"]),
    "Mapeamento de places":       ("solucao", [r"mapeamento de places", r"filtro dos places",
                                                r"filtramos os places", r"enderecos mapeados"]),
    "Régua de pré-compra":        ("solucao", [r"regua de pre-?compra", r"ativacao pre-?compra"]),
    # ---- features / complementos ----
    "PDOOH":                      ("feature", [r"p-?dooh"]),
    "Brand Lift Survey":          ("feature", [r"brand lift", r"intent lift", r"grupo exposto",
                                                r"grau de confianca"]),
    "Brand Lift OOH":             ("feature", [r"roteiro ativado", r"mesmo estudo,? aplicado ao ooh"]),
    "Brand Recall Survey":        ("feature", [r"brand recall"]),
    "Downloaded Apps":            ("feature", [r"downloaded ?apps", r"aplicativos instalados"]),
    "Tap To Map":                 ("feature", [r"tap to map", r"tap-?to-?go"]),
    "Match Content":              ("feature", [r"match content", r"\bcontextual\b", r"\btopics\b"]),
    "Free Form":                  ("feature", [r"free form"]),
    "In-Video Banner":            ("feature", [r"in-?video banner"]),
    "Click-to-Calendar":          ("feature", [r"click.?to.?calendar"]),
    "Dynamic Ads":                ("feature", [r"dynamic ads"]),
    "HYPR Design Studio":         ("feature", [r"design studio"]),
    "Max Attention":              ("feature", [r"max attention"]),
    "Blueprint regional":         ("feature", [r"blueprint regional"]),
    "Audience Overlap":           ("feature", [r"\boverlap\b"]),
}

# Slides estruturais (capa, divisória, agradecimento) — sem tag
SKIP_PATTERNS = [
    r"presented by", r"apresentado por", r"^obrigado", r"\bindice\b", r"\bsumario\b",
    r"o futuro do pixel de midia", r"all rights reserved\.? hypr confidential\.?$",
]

# Slide de feature que também mostra volumetria — NÃO é slide de audiência
FEATURE_SLIDE_SIGNALS = [r"features? (&|e) complementos", r"hypr features?\b", r"^\s*0?4\s+features"]

# Sinais de slide de audiência
AUDIENCE_SIGNALS = [
    r"principais audiencias", r"devices estimados", r"hypr special audiences",
    r"hypr curated audiences", r"audiencias? potenciais", r"redes mapeadas",
    r"places mapeados", r"domicilios mapeados",
]

# Linha de volumetria: "4,4M", "18,4M", "128K", "1.9M"
_VOLUME_RE = re.compile(r"^\+?\d[\d.,]*\s*[mk]\s*$", re.I)
# Eixos que aparecem em caixa alta logo acima do nome (não são o nome)
_AXIS_WORDS = {"comportamento", "afinidade", "lifestyle", "censitaria", "proximidade",
               "mobilidade", "o2o", "ooh", "marketing"}

# Linhas descritivas que aparecem acima da volumetria em vários templates e
# NÃO são nome de cluster. Comparação sobre texto normalizado.
_NOT_AUDIENCE_NAMES = {
    "potenciais compradores", "place visits", "store visits", "hypr location", "insight",
    "cnaes mapeados", "ooh amplification", "visitantes prontos para impacto",
    "familias com maior poder aquisitivo", "proximos a concorrentes",
    "devices estimados", "users", "usuarios unicos", "available audience",
}
_MAX_NAME_WORDS = 5


# ============================================================
# HELPERS
# ============================================================
def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", text.lower()).strip()


def _any(norm: str, patterns: list[str]) -> bool:
    return any(re.search(p, norm) for p in patterns)


def _is_skip(norm: str) -> bool:
    return len(norm) < 40 or _any(norm, SKIP_PATTERNS)


def _is_audience(norm: str) -> bool:
    if _any(norm, FEATURE_SLIDE_SIGNALS) and not re.search(r"principais audiencias", norm):
        return False
    return _any(norm, AUDIENCE_SIGNALS)


def _looks_like_title(cand: str) -> bool:
    """Nome de audiência: curto, sem ponto final, sem dígitos, até 5 palavras,
    não começa com '+' (linhas de interesse) e não está na lista de exclusão."""
    if not cand or len(cand) > 45 or cand.endswith((".", ":", "!", "?")):
        return False
    if cand.lstrip().startswith(("+", "•", "-", "▪")):
        return False
    if re.search(r"\d", cand) or len(cand.split()) > _MAX_NAME_WORDS:
        return False
    if _norm(cand) in _NOT_AUDIENCE_NAMES:
        return False
    return True


# ============================================================
# AUDIÊNCIAS — heurística (fallback) e LLM
# ============================================================
def _audiences_heuristic(slide_text: str) -> list[dict]:
    """
    Layout típico:
        COMPORTAMENTO            ← eixo (caixa alta)
        EMPREENDEDORES           ← família (caixa alta)
        Varejo de Bairro         ← NOME  (Title case)
        4,4M                     ← volumetria
        DEVICES ESTIMADOS
    Regra: para cada linha de volumetria, o nome é a linha não-vazia mais
    próxima acima que NÃO está toda em caixa alta e não é eixo.
    """
    lines = [l.strip() for l in slide_text.splitlines()]
    found: list[dict] = []
    for i, line in enumerate(lines):
        if not _VOLUME_RE.match(line):
            continue
        for j in range(i - 1, max(i - 9, -1), -1):
            cand = lines[j]
            if not _looks_like_title(cand):
                continue
            if cand.isupper() or _norm(cand) in _AXIS_WORDS:
                continue
            found.append({"name": cand, "detail": f"{line} devices"})
            break
    return found


_LLM_PROMPT = """Você recebe o texto de UM slide de uma apresentação comercial da HYPR
(mídia baseada em dados de localização). O slide descreve uma ou mais audiências (clusters).
Extraia o NOME de cada audiência exatamente como aparece como TÍTULO CURTO do cluster
(1 a 5 palavras), ex.: "Luxo recorrente", "Fluxo rodoviário", "Decisores de Marketing",
"Varejo de Bairro", "Premium Banking".
Regras:
- Não invente nem resuma: copie o título que está no slide.
- Ignore eixos genéricos (COMPORTAMENTO, AFINIDADE, LIFESTYLE), nomes de redes/lojas,
  linhas que começam com "+" (interesses) e descrições como "Potenciais compradores",
  "Place visits", "Visitantes prontos para impacto".
- Se o único candidato for uma frase (mais de 5 palavras), NÃO use a frase: devolva [].
- Se não houver audiência nomeada, devolva [].

Responda SOMENTE com JSON válido, sem markdown:
[{"name": "...", "detail": "eixo, volumetria e principais redes em até 15 palavras"}]

Texto do slide:
\"\"\"
__SLIDE__
\"\"\""""

_llm_model = None


def _get_llm():
    global _llm_model
    if _llm_model is None:
        import vertexai
        from vertexai.generative_models import GenerativeModel
        vertexai.init(
            project=os.environ["GCP_PROJECT"],
            location=os.environ.get("GCP_REGION", "southamerica-east1"),
        )
        _llm_model = GenerativeModel(TAGGING_MODEL)
    return _llm_model


def _audiences_llm(slide_text: str) -> Optional[list[dict]]:
    """Retorna lista (pode ser vazia) ou None se o LLM falhou."""
    try:
        from vertexai.generative_models import GenerationConfig
        resp = _get_llm().generate_content(
            _LLM_PROMPT.replace("__SLIDE__", slide_text[:6000]),
            generation_config=GenerationConfig(
                temperature=0, response_mime_type="application/json"
            ),
        )
        data = json.loads(resp.text)
        out = []
        for d in data:
            if not (isinstance(d, dict) and d.get("name")):
                continue
            name = str(d["name"]).strip()
            if not _looks_like_title(name):
                continue
            out.append({"name": name, "detail": d.get("detail", "")})
        return out
    except Exception as e:  # noqa: BLE001
        log.warning(f"[Tagging] LLM falhou, usando heurística: {e}")
        return None


def extract_audiences(slide_text: str) -> tuple[list[dict], str]:
    """Devolve (audiências, source) onde source ∈ {'llm','rules'}."""
    if TAGGING_USE_LLM:
        res = _audiences_llm(slide_text)
        if res is not None:
            return res, "llm"
    return _audiences_heuristic(slide_text), "rules"


# ============================================================
# API PÚBLICA
# ============================================================
def tag_slide(slide_text: str) -> list[dict]:
    """
    Tags de um slide: [{category, tag, detail, source}].
    Slides estruturais retornam [].
    """
    norm = _norm(slide_text)
    if _is_skip(norm):
        return []

    out: list[dict] = []
    for tag, (cat, patterns) in TAXONOMY.items():
        if _any(norm, patterns):
            out.append({"category": cat, "tag": tag, "detail": "", "source": "rules"})

    if _is_audience(norm):
        auds, source = extract_audiences(slide_text)
        for a in auds:
            out.append({
                "category": "audiencia",
                "tag": a["name"].strip(),
                "detail": (a.get("detail") or "").strip()[:300],
                "source": source,
            })

    # dedupe por (categoria, tag normalizada)
    seen, res = set(), []
    for r in out:
        key = (r["category"], _norm(r["tag"]))
        if key not in seen:
            seen.add(key)
            res.append(r)
    return res


def tag_deck(deck_id: str, client: str, slides: list[dict]) -> list[dict]:
    """
    slides: [{"index": int (1-based), "object_id": str|None, "text": str}]
    Retorna rows prontas pro BigQuery (tabela decks_slide_tags).
    """
    now = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []
    for s in slides:
        for t in tag_slide(s.get("text", "")):
            rows.append({
                "deck_id": deck_id,
                "client": client,
                "slide_index": int(s["index"]),
                "slide_object_id": s.get("object_id"),
                "category": t["category"],
                "tag": t["tag"],
                "detail": t["detail"],
                "source": t["source"],
                "tagged_at": now,
            })
    return rows


if __name__ == "__main__":
    # Teste offline: python tagging.py deck.txt   (slides separados por linha '-----')
    import sys
    os.environ.setdefault("TAGGING_USE_LLM", "0")
    TAGGING_USE_LLM = False
    raw = open(sys.argv[1], encoding="utf-8").read()
    parts = [p for p in re.split(r"\n-{3,}\n", raw) if p.strip()]
    slides = [{"index": i, "object_id": None, "text": p} for i, p in enumerate(parts, 1)]
    for r in tag_deck("local", "teste", slides):
        print(f"{r['slide_index']:>3}  {r['category']:<9} {r['tag']:<32} {r['detail']}")
