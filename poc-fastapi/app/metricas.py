"""Métricas de ranqueamento."""
import numpy as np


def dcg(relevancias: np.ndarray, k: int) -> float:
    r = relevancias[:k]
    return float(np.sum((2 ** r - 1) / np.log2(np.arange(2, len(r) + 2))))


def ndcg_at_k(rel_verdadeira: np.ndarray, scores: np.ndarray, k: int = 5) -> float:
    """NDCG@k: 1.0 = a ordem sugerida é a melhor possível segundo a relevância verdadeira."""
    ordem = np.argsort(-scores, kind="stable")
    ideal = np.sort(rel_verdadeira)[::-1]
    d = dcg(rel_verdadeira[ordem], k)
    i = dcg(ideal, k)
    return d / i if i > 0 else 0.0


def precisao_at_k(rel_verdadeira: np.ndarray, scores: np.ndarray, k: int = 5, limiar: float = 0.6) -> float:
    ordem = np.argsort(-scores, kind="stable")[:k]
    return float(np.mean(rel_verdadeira[ordem] >= limiar)) if len(ordem) else 0.0


def sobreposicao_topk(a: np.ndarray, b: np.ndarray, k: int = 5) -> float:
    """Fração dos k primeiros de 'a' que também estão entre os k primeiros de 'b'."""
    kk = min(k, len(a))
    if kk == 0:
        return 1.0
    ta = set(np.argsort(-a, kind="stable")[:kk])
    tb = set(np.argsort(-b, kind="stable")[:kk])
    return len(ta & tb) / kk


def ganho_normalizado_topk(rel_verdadeira: np.ndarray, scores: np.ndarray, k: int = 5) -> float:
    """Quanto da 'melhora possível' a lista captura: 0 = tão boa quanto sortear, 1 = top-k ideal.

    (média da relevância nos k sugeridos − média geral) / (média do top-k ideal − média geral).
    Mais sensível que o NDCG quando as relevâncias são parecidas entre si.
    """
    kk = min(k, len(rel_verdadeira))
    if kk == 0:
        return 0.0
    media = float(np.mean(rel_verdadeira))
    ideal = float(np.mean(np.sort(rel_verdadeira)[::-1][:kk]))
    obtido = float(np.mean(rel_verdadeira[np.argsort(-scores, kind="stable")[:kk]]))
    return (obtido - media) / (ideal - media) if ideal > media else 1.0
