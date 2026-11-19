"""Treina e avalia os modelos. Uso: python scripts/treinar.py [n_alunos]"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import ml  # noqa: E402

if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    print(json.dumps(ml.treinar(n), ensure_ascii=False, indent=2))
