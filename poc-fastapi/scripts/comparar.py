"""Compara Node (motor atual) × Python (regras) × Python (ML): equivalência, desempenho e custo de implantação.
Uso: python scripts/comparar.py   (precisa do modelo treinado e do Node instalado)"""
import json
import statistics as st
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from app import ml, regras, sintetico  # noqa: E402
from app.dados import cursos  # noqa: E402

N = 500
rng = np.random.default_rng(2026)
perfis = [sintetico.gerar_aluno(rng) for _ in range(N)]

# ---- 1. Node (motor atual)
t0 = time.perf_counter()
p = subprocess.run(["node", str(RAIZ / "scripts" / "rodar_node.js")], input=json.dumps(perfis),
                   capture_output=True, text=True, check=True, env={"MEDIR": "1", "PATH": "/usr/bin:/usr/local/bin"})
node_total_ms = (time.perf_counter() - t0) * 1000
node_out = json.loads(p.stdout)
node_motor_ms = float(p.stderr.split(" em ")[1].split(" ms")[0])

# ---- 2. Equivalência regras Python × Node
iguais_ordem = iguais_score = 0
for perfil, esp in zip(perfis, node_out):
    py = regras.recomendar(cursos(), perfil["pontuacao"], perfil["uf"], None, perfil["orcamento_max"], 50)["recomendacoes"]
    a = [(c["id"], c["score"]) for c in py]
    b = [(c["id"], c["score"]) for c in esp["recomendacoes"]]
    iguais_ordem += [x[0] for x in a] == [x[0] for x in b]
    iguais_score += a == b

# ---- 3. ML × regras (top-5)
sobrep, top1 = [], []
for perfil, esp in zip(perfis, node_out):
    r = ml.recomendar(cursos(), perfil["pontuacao"], perfil["uf"], None, perfil["orcamento_max"], 5)["recomendacoes"]
    n5 = [c["id"] for c in esp["recomendacoes"][:5]]
    m5 = [c["id"] for c in r]
    if n5:
        sobrep.append(len(set(n5) & set(m5)) / len(n5))
        top1.append(n5[0] == m5[0])

# ---- 4. Latência por chamada (em processo)
def medir(fn, rep=300):
    ts = []
    for perfil in perfis[:rep]:
        t = time.perf_counter(); fn(perfil); ts.append((time.perf_counter() - t) * 1000)
    return {"media_ms": round(st.mean(ts), 3), "p95_ms": round(sorted(ts)[int(len(ts) * 0.95)], 3)}

ml.carregar()
lat = {
    "python_regras": medir(lambda q: regras.recomendar(cursos(), q["pontuacao"], q["uf"], None, q["orcamento_max"], 5)),
    "python_ml": medir(lambda q: ml.recomendar(cursos(), q["pontuacao"], q["uf"], None, q["orcamento_max"], 5)),
    "node_regras_lote_500_ms_por_perfil": round(node_motor_ms / N, 4),
}

# ---- 5. HTTP (FastAPI real, uvicorn) e partida a frio
import socket
import urllib.request

def porta_livre():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); return s.getsockname()[1]

porta = porta_livre()
t0 = time.perf_counter()
srv = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(porta), "--log-level", "warning"], cwd=RAIZ)
partida_ms = None
for _ in range(200):
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{porta}/health", timeout=1); partida_ms = (time.perf_counter() - t0) * 1000; break
    except Exception:
        time.sleep(0.05)
http = {}
try:
    for modelo in ["regras", "ml"]:
        ts = []
        for perfil in perfis[:200]:
            corpo = json.dumps({**perfil, "limite": 5, "modelo": modelo}).encode()
            req = urllib.request.Request(f"http://127.0.0.1:{porta}/recomendar", corpo, {"Content-Type": "application/json"})
            t = time.perf_counter(); urllib.request.urlopen(req).read(); ts.append((time.perf_counter() - t) * 1000)
        http[modelo] = {"media_ms": round(st.mean(ts), 2), "p95_ms": round(sorted(ts)[int(len(ts) * 0.95)], 2)}
    rss = subprocess.run(["ps", "-o", "rss=", "-p", str(srv.pid)], capture_output=True, text=True).stdout.strip()
finally:
    srv.terminate(); srv.wait()

def pasta_mb(nome):
    r = subprocess.run(["python3", "-c", f"import {nome},os;print(os.path.dirname({nome}.__file__))"], capture_output=True, text=True).stdout.strip()
    tot = subprocess.run(["du", "-sm", r], capture_output=True, text=True).stdout.split()[0]
    return int(tot)

resultado = {
    "perfis_testados": N,
    "equivalencia_python_regras_x_node": {"mesma_ordem_pct": round(100 * iguais_ordem / N, 1), "mesmas_notas_e_ordem_pct": round(100 * iguais_score / N, 1)},
    "ml_x_motor_atual_top5": {"sobreposicao_media_pct": round(100 * float(np.mean(sobrep)), 1), "mesmo_primeiro_pct": round(100 * float(np.mean(top1)), 1)},
    "latencia_em_processo": lat,
    "latencia_http_fastapi": http,
    "partida_fastapi_ms": round(partida_ms) if partida_ms else None,
    "memoria_fastapi_mb": round(int(rss) / 1024) if rss else None,
    "tamanho_dependencias_mb": {"scikit-learn": pasta_mb("sklearn"), "numpy": pasta_mb("numpy"), "scipy": pasta_mb("scipy"), "fastapi": pasta_mb("fastapi")},
    "tamanho_modelo_kb": json.loads((RAIZ / "models" / "metricas.json").read_text())["tamanho_modelo_kb"],
    "linhas_de_codigo": {
        "node_recomendacao.js": len((RAIZ.parent / "src/services/recomendacao.js").read_text().splitlines()),
        "python_regras.py": len((RAIZ / "app/regras.py").read_text().splitlines()),
        "python_ml_mais_features.py": len((RAIZ / "app/ml.py").read_text().splitlines()) + len((RAIZ / "app/features.py").read_text().splitlines()),
    },
}
(RAIZ / "resultados" / "comparacao.json").write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(resultado, ensure_ascii=False, indent=2))
