"""Gerador de alunos e 'feedback' SIMULADOS para treinar/avaliar a PoC.

ATENÇÃO (limite metodológico): ainda não existem alunos reais. Estes dados são sintéticos e servem
para provar o PIPELINE (atributos → treino → avaliação → publicação), não a qualidade das recomendações.
No piloto, o feedback real ("essa recomendação foi útil?") substitui este módulo.

O 'feedback' simulado = pontuação do motor por regras + preferências globais que as regras não
capturam (ex.: estudantes do ensino médio tendem a valorizar curso técnico, público e presencial,
e a perfil bem definido) + ruído individual. Assim o modelo tem algo aprendível além das regras.
"""
import numpy as np

from . import features, regras
from .dados import cursos as carregar_cursos
from .dados import regiao_por_uf, slugs_areas

UFS_PESOS = {"AM": 0.5, "PA": 0.1, "SP": 0.1, "RS": 0.05, "PE": 0.05, "BA": 0.05, "DF": 0.05, "MG": 0.05, "GO": 0.025, "SC": 0.025}
ORCAMENTOS = [None, 0, 300, 600, 1000, 1500]
N_PERGUNTAS = 6


def gerar_aluno(rng: np.random.Generator) -> dict:
    slugs = slugs_areas()
    dominante, secundaria = rng.choice(len(slugs), size=2, replace=False)
    p = np.full(len(slugs), 0.0)
    nitidez = rng.uniform(0.2, 0.8)  # perfis bem definidos e confusos
    p += (1 - nitidez) / len(slugs)
    p[dominante] += nitidez * 0.7
    p[secundaria] += nitidez * 0.3
    respostas = rng.multinomial(N_PERGUNTAS, p / p.sum())
    ufs = list(UFS_PESOS)
    uf = rng.choice(ufs, p=np.array(list(UFS_PESOS.values())) / sum(UFS_PESOS.values())) if rng.random() < 0.85 else None
    orcamento = ORCAMENTOS[rng.integers(len(ORCAMENTOS))]
    return {"pontuacao": {s: int(v) for s, v in zip(slugs, respostas)}, "uf": uf, "orcamento_max": orcamento}


def utilidade_simulada(curso: dict, aluno: dict, rng: np.random.Generator) -> float | None:
    """Relevância 0–1 que o aluno 'daria' ao curso. None se o curso é inviável para ele."""
    uf, regiao = regras.contexto(aluno["uf"], None)
    ctx = features.contexto_do_aluno(aluno["pontuacao"])
    f = regras.fatores(curso, ctx["afinidades"], uf, regiao, aluno["orcamento_max"])
    if not regras.viavel(f):
        return None
    base = sum(regras.PESOS[k] * f[k] for k in regras.PESOS)
    nitido = 1 - ctx["indefinicao"]
    ajuste = (
        0.12 * f["afinidade"] ** 2                      # quem tem área dominante quer mesmo aquela área
        + 0.07 * (curso["nivel"] == "tecnico")           # curso técnico é mais atraente para quem sai do ensino médio
        + 0.06 * (curso["mensalidade"] == 0)             # gratuito pesa mais que as regras supõem
        - 0.06 * (curso["modalidade"] == "ead")          # EAD é menos desejado que o presencial
        - 0.04 * (curso["duracao_meses"] >= 60)          # cursos muito longos assustam
        + 0.05 * nitido * (f["afinidade"] >= 0.99)       # perfil nítido reforça a área principal
    )
    ruido = rng.normal(0, 0.05)
    return float(np.clip(base + ajuste + ruido, 0, 1.2) / 1.2)


def gerar_base(n_alunos: int, semente: int = 7):
    """Retorna X, y, grupo (id do aluno) e a lista de alunos."""
    rng = np.random.default_rng(semente)
    cursos = carregar_cursos()
    X, y, grupo, alunos = [], [], [], []
    for gid in range(n_alunos):
        a = gerar_aluno(rng)
        alunos.append(a)
        uf, regiao = regras.contexto(a["uf"], None)
        ctx = features.contexto_do_aluno(a["pontuacao"])
        for c in cursos:
            rel = utilidade_simulada(c, a, rng)
            if rel is None:
                continue
            X.append(features.vetor(c, ctx, uf, regiao, a["orcamento_max"]))
            y.append(rel)
            grupo.append(gid)
    return np.asarray(X), np.asarray(y), np.asarray(grupo), alunos
