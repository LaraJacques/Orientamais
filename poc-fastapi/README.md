# Orienta+ — PoC FastAPI + scikit-learn (motor de recomendação)

Prova de conceito citada no artigo: avaliar **Python + FastAPI + scikit-learn** como evolução do motor de
recomendação (hoje em Node, por regras e pesos). Não altera o site em produção.

## O que tem aqui
| Arquivo | Função |
|---|---|
| `app/regras.py` | Porte fiel do motor Node (baseline). Dá **o mesmo resultado** em 500 perfis. |
| `app/features.py` | Atributos (perfil × curso) usados pelo modelo. Sem id/nome do curso: aceita cursos novos. |
| `app/sintetico.py` | Alunos e "feedback" **simulados** (ainda não há alunos reais). |
| `app/ml.py` | Treino/avaliação de Ridge, Random Forest e Gradient Boosting; escolhe pelo ganho na validação (parcimônia). |
| `app/main.py` | API: `POST /recomendar` (`modelo`: `regras` \| `similaridade` \| `ml`), `GET /modelo/metricas`, `/health`. |
| `scripts/treinar.py` | Treina e grava `models/ranker.joblib` + `models/metricas.json`. |
| `scripts/comparar.py` | Node × Python: equivalência, desempenho, tamanho. Grava `resultados/comparacao.json`. |
| `tests/test_poc.py` | 9 testes (inclui equivalência com o Node). |

## Rodando
```bash
cd poc-fastapi
pip install -r requirements.txt
python scripts/treinar.py          # ~10 s
python -m pytest -q tests          # 9 testes
uvicorn app.main:app --reload      # http://127.0.0.1:8000/docs
```
Exemplo:
```bash
curl -X POST localhost:8000/recomendar -H 'Content-Type: application/json' \
  -d '{"pontuacao":{"exatas":4,"saude":1,"criativas":1},"uf":"AM","orcamento_max":600,"limite":5,"modelo":"ml"}'
```
Para reexportar os cursos do backend: `node scripts/exportar_dados.js` (na raiz do repositório, com `poc-fastapi/` dentro dele).

## Como o modelo funciona
1. **Restrições duras por regra:** curso acima do orçamento ou fora da região é descartado antes do modelo.
2. **Aprendizado:** para cada par (aluno, curso viável) o modelo prevê a relevância (0–1) a partir de 18 atributos
   (afinidade, posição da área no perfil, definição do perfil, custo, nível, modalidade, mercado…).
3. **Explicação:** os `motivos` em texto continuam vindo das regras, então o aluno entende o porquê da sugestão.

## Limite importante
Os dados de treino são **sintéticos**. Isto valida o *pipeline* (atributos → treino → API → medição), não a qualidade
real das recomendações. No piloto, o feedback dos alunos ("essa recomendação foi útil?") substitui `sintetico.py`
e o mesmo `treinar.py` retreina o modelo.
