"""Carrega os cursos/áreas exportados do backend Node (data/*.json)."""
import json
from functools import lru_cache
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "data"


@lru_cache(maxsize=1)
def cursos() -> list[dict]:
    return json.loads((DIR / "cursos.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def areas() -> list[dict]:
    return json.loads((DIR / "areas.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def regiao_por_uf() -> dict[str, str]:
    return json.loads((DIR / "regioes.json").read_text(encoding="utf-8"))


def slugs_areas() -> list[str]:
    return [a["slug"] for a in areas()]
