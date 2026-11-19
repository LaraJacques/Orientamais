"""Motor por regras: porte fiel de src/services/recomendacao.js (backend Node).

É a linha de base da PoC: serve para provar que o Python reproduz o motor atual
(equivalência) e para comparar com os modelos de aprendizado de máquina.
"""
import math

from .dados import regiao_por_uf

PESOS = {"afinidade": 0.5, "regional": 0.2, "orcamento": 0.15, "mercado": 0.15}


def arredondar(n: float, casas: int = 1) -> float:
    """Math.round do JavaScript (meio arredonda para cima), para bater com o Node."""
    f = 10 ** casas
    x = n * f
    base = math.floor(x)
    return (base + 1 if x - base >= 0.5 else base) / f  # sem somar 0,5 (evita erro de ponto flutuante)


def normalizar_afinidades(pontuacao: dict[str, float]) -> dict[str, float]:
    maximo = max(pontuacao.values()) if pontuacao else 0
    return {k: (v / maximo if maximo > 0 else 0) for k, v in pontuacao.items()}


def fator_regional(curso: dict, uf: str | None, regiao: str | None) -> float:
    if not uf and not regiao:
        return 1.0
    if curso["modalidade"] == "ead":
        return 0.8
    if uf and curso["uf"] == uf:
        return 1.0
    if regiao and curso["regiao"] == regiao:
        return 0.6 if uf else 1.0
    return 0.0


def fator_orcamento(curso: dict, orcamento_max: float | None) -> float:
    if orcamento_max is None:
        return 1.0
    if curso["mensalidade"] == 0:
        return 1.0
    if curso["mensalidade"] > orcamento_max:
        return 0.0
    return 1 - 0.5 * (curso["mensalidade"] / orcamento_max)


def fator_mercado(curso: dict) -> float:
    return curso["mercado_nivel"] / 5 if curso.get("mercado_nivel") else 0.5


def contexto(uf: str | None, regiao: str | None) -> tuple[str | None, str | None]:
    uf = uf.upper() if uf else None
    return uf, (regiao or (regiao_por_uf().get(uf) if uf else None))


def fatores(curso: dict, afinidades: dict[str, float], uf, regiao, orcamento_max) -> dict[str, float]:
    return {
        "afinidade": afinidades.get(curso["area"], 0.0),
        "regional": fator_regional(curso, uf, regiao),
        "orcamento": fator_orcamento(curso, orcamento_max),
        "mercado": fator_mercado(curso),
    }


def viavel(f: dict[str, float]) -> bool:
    """Restrições duras: fora da região ou acima do orçamento o curso é descartado."""
    return f["regional"] > 0 and f["orcamento"] > 0


def _moeda(n: float) -> str:
    s = f"{n:,.2f}".rstrip("0").rstrip(".") if n % 1 else f"{int(n):,}"
    return "R$ " + s.replace(",", "X").replace(".", ",").replace("X", ".")


def motivos(curso: dict, f: dict[str, float], uf, regiao, orcamento_max) -> list[str]:
    nome_area = curso["area_nome"]
    m = []
    if f["afinidade"] >= 0.99:
        m.append(f"Combina com seu perfil: {nome_area} foi sua área de maior afinidade.")
    elif f["afinidade"] >= 0.6:
        m.append(f"Tem boa afinidade com seu perfil em {nome_area}.")
    else:
        m.append(f"Afinidade menor com seu perfil ({nome_area}) — vale como alternativa.")
    if curso["modalidade"] == "ead":
        m.append("É a distância (EAD): dá para estudar de onde você estiver.")
    elif uf and curso["uf"] == uf:
        m.append(f"Fica em {curso['cidade']}/{curso['uf']}, no seu estado.")
    elif regiao and curso["regiao"] == regiao:
        m.append(f"Fica em {curso['cidade']}/{curso['uf']}, na sua região.")
    if curso["mensalidade"] == 0:
        m.append("Gratuito (instituição pública).")
    elif orcamento_max is not None:
        m.append(f"Mensalidade de {_moeda(curso['mensalidade'])} cabe no seu orçamento de {_moeda(orcamento_max)}.")
    else:
        m.append(f"Mensalidade de {_moeda(curso['mensalidade'])}.")
    if curso.get("mercado_nivel"):
        m.append(f"Mercado de trabalho da carreira: nível {curso['mercado_nivel']} de 5.")
    return m


def _chave_ordem(item: dict):
    return (-item["score"], item["mensalidade"], item["nome"].casefold())


def recomendar(cursos: list[dict], pontuacao: dict[str, float], uf=None, regiao=None,
               orcamento_max=None, limite=10) -> dict:
    afin = normalizar_afinidades(pontuacao)
    uf, regiao = contexto(uf, regiao)
    avaliados = []
    for c in cursos:
        f = fatores(c, afin, uf, regiao, orcamento_max)
        if not viavel(f):
            continue
        # soma explícita da esquerda para a direita, como no JavaScript (o sum() do Python 3.12+ compensa erros
        # de ponto flutuante e daria 97,8 onde o Node dá 97,7)
        score = 100 * (PESOS["afinidade"] * f["afinidade"] + PESOS["regional"] * f["regional"]
                       + PESOS["orcamento"] * f["orcamento"] + PESOS["mercado"] * f["mercado"])
        avaliados.append({
            **c,
            "score": arredondar(score),
            "compatibilidade": {
                "afinidade": arredondar(f["afinidade"] * 100, 0), "regiao": arredondar(f["regional"] * 100, 0),
                "orcamento": arredondar(f["orcamento"] * 100, 0), "mercado": arredondar(f["mercado"] * 100, 0),
            },
            "motivos": motivos(c, f, uf, regiao, orcamento_max),
            "custo_total_estimado": arredondar(c["mensalidade"] * c["duracao_meses"], 2),
        })
    avaliados.sort(key=_chave_ordem)
    return {"total_candidatos": len(avaliados), "recomendacoes": avaliados[:limite]}
