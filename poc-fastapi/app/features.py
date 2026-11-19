"""Engenharia de atributos: transforma (perfil do aluno, curso) em um vetor numérico.

O modelo NÃO recebe o id nem o nome do curso: só atributos. Assim ele continua
funcionando quando novos cursos forem cadastrados.
"""
import math

import numpy as np

from . import regras
from .dados import slugs_areas

NOMES = [
    "afinidade", "ranking_da_area", "participacao_da_area", "definicao_do_perfil",
    "fator_regional", "fator_orcamento", "mercado", "mensalidade_mil", "mensalidade_sobre_orcamento",
    "duracao_anos", "nivel_tecnico", "nivel_superior", "ead", "hibrido", "publica", "gratuito",
    "informou_orcamento", "informou_uf",
]


def _entropia_normalizada(valores: list[float]) -> float:
    total = sum(valores)
    if total <= 0:
        return 1.0
    ps = [v / total for v in valores if v > 0]
    h = -sum(p * math.log(p) for p in ps)
    return h / math.log(len(valores))


def contexto_do_aluno(pontuacao: dict[str, float]) -> dict:
    slugs = slugs_areas()
    pts = [float(pontuacao.get(s, 0)) for s in slugs]
    total = sum(pts)
    ordem = sorted(range(len(slugs)), key=lambda i: -pts[i])
    posicao = {slugs[i]: r for r, i in enumerate(ordem)}
    return {
        "afinidades": regras.normalizar_afinidades({s: pontuacao.get(s, 0) for s in slugs}),
        "posicao": posicao,
        "participacao": {s: (p / total if total > 0 else 0.0) for s, p in zip(slugs, pts)},
        # 0 = perfil bem definido (uma área domina); 1 = tudo igual
        "indefinicao": _entropia_normalizada(pts),
    }


def vetor(curso: dict, ctx: dict, uf, regiao, orcamento_max) -> list[float]:
    f = regras.fatores(curso, ctx["afinidades"], uf, regiao, orcamento_max)
    mens = float(curso["mensalidade"])
    return [
        f["afinidade"],
        ctx["posicao"][curso["area"]] / (len(ctx["posicao"]) - 1),
        ctx["participacao"][curso["area"]],
        ctx["indefinicao"],
        f["regional"], f["orcamento"], f["mercado"],
        mens / 1000,
        (mens / orcamento_max) if orcamento_max else 0.0,
        curso["duracao_meses"] / 12,
        1.0 if curso["nivel"] == "tecnico" else 0.0,
        1.0 if curso["nivel"] != "tecnico" else 0.0,
        1.0 if curso["modalidade"] == "ead" else 0.0,
        1.0 if curso["modalidade"] == "hibrido" else 0.0,
        1.0 if curso["rede"] == "publica" else 0.0,
        1.0 if mens == 0 else 0.0,
        1.0 if orcamento_max is not None else 0.0,
        1.0 if uf or regiao else 0.0,
    ]


def matriz(cursos: list[dict], pontuacao, uf=None, regiao=None, orcamento_max=None):
    """Devolve (cursos viáveis, matriz de atributos). Restrições duras (região/orçamento) filtram antes do modelo."""
    uf, regiao = regras.contexto(uf, regiao)
    ctx = contexto_do_aluno(pontuacao)
    viaveis, linhas = [], []
    for c in cursos:
        f = regras.fatores(c, ctx["afinidades"], uf, regiao, orcamento_max)
        if not regras.viavel(f):
            continue
        viaveis.append(c)
        linhas.append(vetor(c, ctx, uf, regiao, orcamento_max))
    return viaveis, np.asarray(linhas, dtype=float).reshape(len(linhas), len(NOMES))
