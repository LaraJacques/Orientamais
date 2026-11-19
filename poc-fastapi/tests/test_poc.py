import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from app import features, metricas, ml, regras  # noqa: E402
from app.dados import cursos  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)
PERFIL = {"pontuacao": {"exatas": 4, "saude": 1, "criativas": 1, "negocios": 0, "humanas": 0}, "uf": "AM", "orcamento_max": 600}


def test_regras_respeitam_orcamento_e_regiao():
    r = regras.recomendar(cursos(), **{**PERFIL, "limite": 50})
    assert r["recomendacoes"]
    for c in r["recomendacoes"]:
        assert c["mensalidade"] <= 600
        assert c["modalidade"] == "ead" or c["regiao"] == "norte"


def test_regras_arredondamento_igual_ao_javascript():
    assert regras.arredondar(0.25) == 0.3 and regras.arredondar(2.5, 0) == 3  # meio sobe, como Math.round


def test_atributos_tem_o_tamanho_certo():
    viaveis, X = features.matriz(cursos(), PERFIL["pontuacao"], "AM", None, 600)
    assert X.shape == (len(viaveis), len(features.NOMES))
    assert np.isfinite(X).all()


def test_metricas_de_ranking():
    rel = np.array([0.9, 0.1, 0.5])
    assert metricas.ndcg_at_k(rel, np.array([3, 1, 2]), 3) == pytest.approx(1.0)
    assert metricas.ndcg_at_k(rel, np.array([1, 3, 2]), 3) < 1.0
    assert metricas.ganho_normalizado_topk(rel, np.array([3, 1, 2]), 1) == pytest.approx(1.0)


@pytest.fixture(scope="session", autouse=True)
def modelo_treinado():
    if not ml.ARQ_MODELO.exists():
        ml.treinar(600)
        ml._cache.clear()


def test_api_ml_ranqueia_e_explica():
    r = client.post("/recomendar", json={**PERFIL, "modelo": "ml", "limite": 5})
    assert r.status_code == 200
    j = r.json()
    assert j["motor"] == "ml" and len(j["recomendacoes"]) == 5
    scores = [c["score"] for c in j["recomendacoes"]]
    assert scores == sorted(scores, reverse=True)
    assert all(c["motivos"] for c in j["recomendacoes"])
    assert j["recomendacoes"][0]["area"] == "exatas"


def test_api_ml_nao_viola_restricoes_duras():
    j = client.post("/recomendar", json={**PERFIL, "modelo": "ml", "limite": 50}).json()
    assert all(c["mensalidade"] <= 600 for c in j["recomendacoes"])


def test_api_tres_motores_e_validacoes():
    for m in ["regras", "similaridade", "ml"]:
        assert client.post("/recomendar", json={**PERFIL, "modelo": m}).json()["motor"] == m
    assert client.post("/recomendar", json={**PERFIL, "pontuacao": {"culinaria": 3}}).status_code == 400
    assert client.post("/recomendar", json={**PERFIL, "pontuacao": {"exatas": -1}}).status_code == 400
    assert client.post("/recomendar", json={**PERFIL, "modelo": "xyz"}).status_code == 422
    assert client.get("/health").json()["status"] == "ok"


def test_perfil_vazio_nao_quebra():
    r = client.post("/recomendar", json={"pontuacao": {}, "modelo": "ml"})
    assert r.status_code == 200


def test_equivalencia_com_o_motor_node():
    """O porte em Python reproduz o motor Node (mesmas notas e mesma ordem) em perfis aleatórios."""
    node = RAIZ.parent / "src" / "services" / "recomendacao.js"
    if not node.exists():
        pytest.skip("rode dentro do repositório completo (precisa do backend Node)")
    perfis = [{"pontuacao": {s: int(v) for s, v in zip(["exatas", "saude", "criativas", "negocios", "humanas"], np.random.default_rng(i).multinomial(6, [0.2] * 5))},
               "uf": ["AM", "SP", None][i % 3], "orcamento_max": [None, 300, 1000][i % 3]} for i in range(30)]
    script = RAIZ / "scripts" / "rodar_node.js"
    saida = subprocess.run(["node", str(script)], input=json.dumps(perfis), capture_output=True, text=True, check=True).stdout
    for perfil, esperado in zip(perfis, json.loads(saida)):
        py = regras.recomendar(cursos(), perfil["pontuacao"], perfil["uf"], None, perfil["orcamento_max"], 50)
        assert [(c["id"], c["score"]) for c in py["recomendacoes"]] == [(c["id"], c["score"]) for c in esperado["recomendacoes"]]
