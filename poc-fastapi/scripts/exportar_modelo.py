"""Exporta o modelo linear treinado (Ridge) para JSON, para o backend Node executá-lo sem Python.
Uso: python scripts/exportar_modelo.py [caminho_de_saida.json]"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from app import ml  # noqa: E402
from app.dados import slugs_areas  # noqa: E402

pacote = ml.carregar()
if pacote["nome"] != "ridge":
    sys.exit(f"Só modelos lineares (ridge) podem ser exportados; o escolhido foi {pacote['nome']}.")
scaler, ridge = pacote["modelo"].steps[0][1], pacote["modelo"].steps[-1][1]
metricas = json.loads(ml.ARQ_METRICAS.read_text(encoding="utf-8"))
saida = {
    "versao": "ridge-sintetico-1",
    "aviso": metricas["aviso"],
    "areas": slugs_areas(),
    "atributos": pacote["atributos"],
    "media": scaler.mean_.tolist(),
    "escala": scaler.scale_.tolist(),
    "coeficientes": ridge.coef_.tolist(),
    "intercepto": float(ridge.intercept_),
    "treino": {"alunos_simulados": metricas["alunos_simulados"], "metricas_teste": metricas["teste"]},
}
destino = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "models" / "modelo-ml.json"
destino.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"modelo exportado em {destino}")
