"""API FastAPI da PoC do motor de recomendação do Orienta+.

Mesma entrada do POST /api/recomendacoes do backend Node, com a escolha do motor:
  modelo=regras        → porte do motor atual (baseline)
  modelo=similaridade  → cosseno perfil × área (sem treino)
  modelo=ml            → modelo do scikit-learn treinado (padrão, se existir)
"""
import json
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import ml, regras
from .dados import areas, cursos, slugs_areas

app = FastAPI(title="Orienta+ — PoC FastAPI + scikit-learn", version="0.1.0")


class Pedido(BaseModel):
    pontuacao: dict[str, float] = Field(..., description='Pontos por área, ex.: {"exatas": 4, "saude": 1}')
    uf: str | None = Field(None, min_length=2, max_length=2)
    regiao: str | None = None
    orcamento_max: float | None = Field(None, ge=0)
    limite: int = Field(10, ge=1, le=50)
    modelo: Literal["regras", "similaridade", "ml"] | None = None


@app.get("/health")
def health():
    return {"status": "ok", "modelo_ml_carregado": ml.carregar() is not None}


@app.get("/areas")
def listar_areas():
    return {"areas": areas()}


@app.get("/modelo/metricas")
def metricas():
    if not ml.ARQ_METRICAS.exists():
        raise HTTPException(404, "Modelo ainda não treinado.")
    return json.loads(ml.ARQ_METRICAS.read_text(encoding="utf-8"))


@app.post("/recomendar")
def recomendar(p: Pedido):
    invalidas = set(p.pontuacao) - set(slugs_areas())
    if invalidas:
        raise HTTPException(400, f"Áreas desconhecidas: {sorted(invalidas)}")
    if any(v < 0 for v in p.pontuacao.values()):
        raise HTTPException(400, "Pontuação não pode ser negativa.")
    modelo = p.modelo or ("ml" if ml.carregar() else "regras")
    args = dict(pontuacao=p.pontuacao, uf=p.uf, regiao=p.regiao, orcamento_max=p.orcamento_max, limite=p.limite)
    if modelo == "regras":
        r = regras.recomendar(cursos(), **args)
    elif modelo == "similaridade":
        r = _similaridade(**args)
    else:
        try:
            r = ml.recomendar(cursos(), **args)
        except RuntimeError as e:
            raise HTTPException(503, str(e)) from e
    return {"motor": modelo, **r}


def _similaridade(pontuacao, uf, regiao, orcamento_max, limite):
    from . import features
    viaveis, _ = features.matriz(cursos(), pontuacao, uf, regiao, orcamento_max)
    s = ml.similaridade(viaveis, pontuacao)
    itens = [{**c, "score": round(float(v) * 100, 1)} for c, v in zip(viaveis, s)]
    itens.sort(key=lambda i: (-i["score"], i["mensalidade"], i["nome"].casefold()))
    return {"total_candidatos": len(itens), "recomendacoes": itens[:limite]}
