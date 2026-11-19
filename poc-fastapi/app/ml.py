"""Modelos de aprendizado de máquina (scikit-learn) para ranquear cursos."""
import json
import time
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from . import features, metricas, regras
from .dados import slugs_areas

DIR_MODELOS = Path(__file__).resolve().parent.parent / "models"
ARQ_MODELO = DIR_MODELOS / "ranker.joblib"
ARQ_METRICAS = DIR_MODELOS / "metricas.json"

CANDIDATOS = {
    "ridge": lambda: make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
    "random_forest": lambda: RandomForestRegressor(n_estimators=150, min_samples_leaf=5, n_jobs=-1, random_state=0),
    "gradient_boosting": lambda: GradientBoostingRegressor(n_estimators=250, max_depth=3, learning_rate=0.05,
                                                            subsample=0.8, random_state=0),
}


def similaridade(cursos_viaveis: list[dict], pontuacao: dict[str, float]) -> np.ndarray:
    """Baseline 'conteúdo': cosseno entre o perfil do aluno (5 áreas) e o vetor da área do curso (sem treino)."""
    slugs = slugs_areas()
    v = np.array([float(pontuacao.get(s, 0)) for s in slugs])
    n = np.linalg.norm(v)
    if n == 0:
        return np.zeros(len(cursos_viaveis))
    return np.array([v[slugs.index(c["area"])] / n for c in cursos_viaveis])


def pontuacao_regras(cursos_viaveis, pontuacao, uf, orcamento_max) -> np.ndarray:
    r = regras.recomendar(cursos_viaveis, pontuacao, uf=uf, orcamento_max=orcamento_max, limite=len(cursos_viaveis) or 1)
    por_id = {x["id"]: x["score"] for x in r["recomendacoes"]}
    return np.array([por_id.get(c["id"], 0.0) for c in cursos_viaveis])


def avaliar(modelo, alunos, X, y, grupo, ids_alunos, k=5) -> dict:
    """Média por aluno de NDCG@k / precisão@k para cada estratégia, só nos alunos de 'ids_alunos'."""
    from .dados import cursos as todos

    res = {n: {"ndcg": [], "ganho": [], "precisao": [], "sobreposicao_regras": []} for n in ["regras", "similaridade", "ml"]}
    pred_total = modelo.predict(X)
    for gid in ids_alunos:
        idx = np.where(grupo == gid)[0]
        if len(idx) == 0:
            continue
        a = alunos[gid]
        uf, regiao = regras.contexto(a["uf"], None)
        ctx = features.contexto_do_aluno(a["pontuacao"])
        viaveis = [c for c in todos()
                   if regras.viavel(regras.fatores(c, ctx["afinidades"], uf, regiao, a["orcamento_max"]))]
        rel = y[idx]
        s_regras = pontuacao_regras(viaveis, a["pontuacao"], a["uf"], a["orcamento_max"])
        s_sim = similaridade(viaveis, a["pontuacao"])
        s_ml = pred_total[idx]
        for nome, s in [("regras", s_regras), ("similaridade", s_sim), ("ml", s_ml)]:
            res[nome]["ndcg"].append(metricas.ndcg_at_k(rel, s, k))
            res[nome]["ganho"].append(metricas.ganho_normalizado_topk(rel, s, k))
            res[nome]["precisao"].append(metricas.precisao_at_k(rel, s, k))
            res[nome]["sobreposicao_regras"].append(metricas.sobreposicao_topk(s, s_regras, k))
    return {n: {m: round(float(np.mean(v)), 4) for m, v in d.items()} for n, d in res.items()}


def treinar(n_alunos: int = 4000, semente: int = 7) -> dict:
    from .sintetico import gerar_base

    X, y, grupo, alunos = gerar_base(n_alunos, semente)
    # 60% treino / 20% validação (escolhe o modelo) / 20% teste (relatório final) — divididos por ALUNO
    todos = np.arange(n_alunos)
    gss = GroupShuffleSplit(n_splits=1, test_size=0.4, random_state=semente)
    tr, resto = next(gss.split(todos, groups=todos))
    gss2 = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=semente)
    va_i, te_i = next(gss2.split(resto, groups=resto))
    val, teste = resto[va_i], resto[te_i]
    mascara_tr = np.isin(grupo, tr)

    candidatos, modelos, melhor = {}, {}, None
    for nome, fabrica in CANDIDATOS.items():
        t0 = time.perf_counter()
        m = fabrica().fit(X[mascara_tr], y[mascara_tr])
        tempo = time.perf_counter() - t0
        na_val = avaliar(m, alunos, X, y, grupo, val)["ml"]
        candidatos[nome] = {"ndcg_validacao": na_val["ndcg"], "ganho_validacao": na_val["ganho"],
                            "precisao_validacao": na_val["precisao"], "tempo_treino_s": round(tempo, 2)}
        modelos[nome] = m
    # Parcimônia: entre os que ficam a menos de 0,002 do melhor ganho, escolhe o mais simples (ordem de CANDIDATOS).
    topo = max(c["ganho_validacao"] for c in candidatos.values())
    escolhido = next(n for n in CANDIDATOS if candidatos[n]["ganho_validacao"] >= topo - 0.002)
    melhor = (escolhido, modelos[escolhido])
    nome_escolhido, modelo = melhor
    final = avaliar(modelo, alunos, X, y, grupo, teste)

    importancias = None
    est = modelo[-1] if hasattr(modelo, "steps") else modelo
    if hasattr(est, "feature_importances_"):
        importancias = sorted(zip(features.NOMES, est.feature_importances_.round(4).tolist()), key=lambda t: -t[1])
    elif hasattr(est, "coef_"):
        importancias = sorted(zip(features.NOMES, np.abs(est.coef_).round(4).tolist()), key=lambda t: -t[1])

    DIR_MODELOS.mkdir(exist_ok=True)
    joblib.dump({"modelo": modelo, "nome": nome_escolhido, "atributos": features.NOMES}, ARQ_MODELO, compress=3)
    metricas_json = {
        "aviso": "Treino e avaliação com dados SINTÉTICOS (sem alunos reais). Valida o pipeline, não a qualidade real.",
        "alunos_simulados": n_alunos, "pares_aluno_curso": int(len(y)),
        "divisao": {"treino": len(tr), "validacao": len(val), "teste": len(teste)},
        "modelo_escolhido": nome_escolhido, "candidatos": candidatos,
        "teste": final, "importancia_dos_atributos": importancias,
        "tamanho_modelo_kb": round(ARQ_MODELO.stat().st_size / 1024, 1),
    }
    ARQ_METRICAS.write_text(json.dumps(metricas_json, ensure_ascii=False, indent=2), encoding="utf-8")
    return metricas_json


_cache = {}


def carregar():
    if "m" not in _cache:
        _cache["m"] = joblib.load(ARQ_MODELO) if ARQ_MODELO.exists() else None
    return _cache["m"]


def recomendar(cursos, pontuacao, uf=None, regiao=None, orcamento_max=None, limite=10) -> dict:
    pacote = carregar()
    if pacote is None:
        raise RuntimeError("Modelo não treinado. Rode: python scripts/treinar.py")
    uf_n, regiao_n = regras.contexto(uf, regiao)
    viaveis, X = features.matriz(cursos, pontuacao, uf, regiao, orcamento_max)
    if not viaveis:
        return {"total_candidatos": 0, "recomendacoes": []}
    pred = pacote["modelo"].predict(X)
    ctx = features.contexto_do_aluno(pontuacao)
    itens = []
    for c, p in zip(viaveis, pred):
        f = regras.fatores(c, ctx["afinidades"], uf_n, regiao_n, orcamento_max)
        itens.append({**c, "score": round(float(np.clip(p, 0, 1)) * 100, 1),
                      "motivos": regras.motivos(c, f, uf_n, regiao_n, orcamento_max),
                      "custo_total_estimado": round(c["mensalidade"] * c["duracao_meses"], 2)})
    itens.sort(key=lambda i: (-i["score"], i["mensalidade"], i["nome"].casefold()))
    return {"total_candidatos": len(itens), "recomendacoes": itens[:limite], "modelo_ml": pacote["nome"]}
