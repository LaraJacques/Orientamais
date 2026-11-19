# Relatório da prova de conceito — Python/FastAPI + scikit-learn × Node/Express

**Projeto:** Orienta+ (TCC, Sistemas de Informação — Fametro) · **Data:** 19/11/2026

## 1. Objetivo
Verificar se o motor de recomendação pode evoluir de regras fixas (Node) para aprendizado de máquina com
Python + FastAPI + scikit-learn, e se essa pilha compensa para o projeto.

## 2. O que foi construído
- Porte do motor atual para Python (`regras.py`), validado contra o Node.
- Modelo de ranqueamento supervisionado (scikit-learn) com 18 atributos de cada par aluno × curso.
- API FastAPI com três motores selecionáveis (`regras`, `similaridade`, `ml`) e endpoint de métricas.
- 9 testes automatizados e scripts de treino e comparação (reproduzíveis).

## 3. Resultados

### 3.1 Equivalência (o porte em Python reproduz o motor atual?)
Em 500 perfis aleatórios: **100%** com a mesma ordem e as mesmas notas que o Node.
(Durante a validação apareceu uma diferença de arredondamento, 97,75 → 97,8 no Python e 97,7 no Node: o `sum()`
do Python 3.12+ compensa erros de ponto flutuante. Corrigido com soma explícita; vale como lição de migração.)

### 3.2 Qualidade do ranqueamento (800 alunos simulados de teste, nunca vistos no treino)
| Estratégia | Ganho normalizado top-5 | NDCG@5 | Precisão@5 |
|---|---|---|---|
| Regras (motor atual) | 0,964 | 0,990 | 0,670 |
| Similaridade (cosseno, sem treino) | 0,935 | 0,986 | 0,666 |
| **ML (Ridge)** | **0,977** | **0,995** | **0,677** |

Modelos candidatos na validação (ganho): Ridge 0,971 · Random Forest 0,970 · Gradient Boosting 0,972.
Ficaram empatados; foi escolhido o **mais simples (Ridge)**, que treina em 0,02 s e ocupa 1,4 KB.
O ML coincide com o motor atual em 88% do top-5 e no primeiro colocado em 43% dos perfis.

> **Leitura honesta:** o "feedback" é simulado e embute preferências que as regras não têm (ex.: preferência por
> curso técnico e gratuito). O ML melhora ~1,3 ponto percentual no ganho **por construção**. O que a PoC prova é
> que o pipeline funciona e mede; **não** prova que o ML recomenda melhor para alunos reais.

### 3.3 Desempenho e implantação
| Critério | Node (atual) | Python regras | Python ML |
|---|---|---|---|
| Tempo por recomendação (em processo) | ~0,20 ms* | 0,03 ms | 0,24 ms |
| Tempo por requisição HTTP (FastAPI) | – | 1,3 ms | 2,0 ms (p95 3,1 ms) |
| Partida do servidor | – | 1,3 s | 1,3 s |
| Memória do servidor | – | – | ~176 MB |
| Dependências instaladas | – | – | ~202 MB (scikit-learn 48 + scipy 109 + numpy 43 + fastapi 2) |
| Linhas de código | 118 | 130 | 227 (atributos + ML) |

\*O Node mede o lote com geração de motivos; os números não são estritamente comparáveis. Em todos os casos o
motor responde em poucos milissegundos, irrelevante para a experiência do aluno.

**Implantação:** segundo a documentação da Vercel, FastAPI roda sem configuração e o limite do pacote Python é
**500 MB** (subiu de 250 MB em fev/2026); as dependências somam ~202 MB, então cabem. **O deploy não foi testado
nesta PoC.** Dois serviços (Node + Python) exigem manter dois ambientes, ou migrar o backend inteiro para Python.

## 4. Decisão sugerida
| Critério | Veredito |
|---|---|
| Viabilidade técnica | Confirmada: pipeline completo, 100% equivalente ao atual e mais lento só em microssegundos |
| Ganho de qualidade | **Não demonstrado** (sem dados reais) |
| Custo de manutenção | Maior (dois runtimes ou reescrita do backend) |
| Potencial de evolução | Alto: scikit-learn, retreino e novas métricas com poucas linhas |

**Recomendação:** manter o Node em produção até o piloto e adotar FastAPI + scikit-learn como **serviço de
recomendação** quando houver feedback real. Critério de adoção: o ML superar o motor por regras em NDCG@5 e
precisão@5 em dados reais de pelo menos algumas centenas de avaliações.

## 5. Limitações
- Sem alunos reais: treino e teste sintéticos (viés de construção explicado acima).
- Apenas 22 cursos e 12 carreiras (dados ilustrativos): pouca diversidade para o modelo.
- Deploy do FastAPI não testado; medições feitas em ambiente de desenvolvimento.

## 6. Próximos passos
1. Coletar feedback no piloto ("útil / não útil") e salvá-lo no banco.
2. Retreinar com dados reais e comparar com o motor atual (teste A/B simples).
3. Ampliar cursos (Cadastro e-MEC) e testar o deploy do FastAPI na Vercel.

## 7. Reprodutibilidade
`pip install -r requirements.txt && python scripts/treinar.py && python scripts/comparar.py && pytest tests`
