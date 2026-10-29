// Motor de pontuação do teste vocacional (fase inicial do pré-projeto: pontuação por área de afinidade).
// Funções puras — sem acesso a banco — para facilitar testes e uma futura troca por modelo de ML.

/**
 * Monta o resultado a partir dos pontos por área.
 * @param {Record<string, number>} pontos  ex.: { exatas: 3, saude: 1, ... }
 * @param {{slug: string, nome: string}[]} areas
 */
function montarResultado(pontos, areas) {
  const total = areas.reduce((soma, a) => soma + (pontos[a.slug] || 0), 0);

  const ranking = areas
    .map((a) => {
      const p = pontos[a.slug] || 0;
      return {
        area: a.slug,
        nome: a.nome,
        pontos: p,
        percentual: total > 0 ? Math.round((p / total) * 1000) / 10 : 0,
      };
    })
    .sort((x, y) => y.pontos - x.pontos || x.nome.localeCompare(y.nome, 'pt-BR'));

  const maximo = ranking[0] ? ranking[0].pontos : 0;
  const areasEmpatadas = maximo > 0 ? ranking.filter((r) => r.pontos === maximo).map((r) => r.area) : [];

  return {
    area_principal: maximo > 0 ? ranking[0].area : null,
    empate: areasEmpatadas.length > 1,
    areas_empatadas: areasEmpatadas,
    ranking,
  };
}

/**
 * Soma os pesos das opções escolhidas e devolve o resultado.
 * @param {{area_slug: string, peso: number}[]} escolhas
 */
function calcularPontuacao(escolhas, areas) {
  const pontos = Object.fromEntries(areas.map((a) => [a.slug, 0]));
  for (const e of escolhas) {
    if (!(e.area_slug in pontos)) throw new Error(`Área desconhecida: ${e.area_slug}`);
    pontos[e.area_slug] += e.peso;
  }
  return { pontos, ...montarResultado(pontos, areas) };
}

module.exports = { calcularPontuacao, montarResultado };
