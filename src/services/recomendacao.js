// Motor de recomendação de cursos: cruza perfil (afinidade por área), orçamento, região e mercado.
// Funções puras — a rota só busca os cursos no banco e chama recomendarCursos().

const PESOS = { afinidade: 0.5, regional: 0.2, orcamento: 0.15, mercado: 0.15 };

const REGIAO_POR_UF = {
  AC: 'norte', AP: 'norte', AM: 'norte', PA: 'norte', RO: 'norte', RR: 'norte', TO: 'norte',
  AL: 'nordeste', BA: 'nordeste', CE: 'nordeste', MA: 'nordeste', PB: 'nordeste', PE: 'nordeste',
  PI: 'nordeste', RN: 'nordeste', SE: 'nordeste',
  DF: 'centro-oeste', GO: 'centro-oeste', MT: 'centro-oeste', MS: 'centro-oeste',
  ES: 'sudeste', MG: 'sudeste', RJ: 'sudeste', SP: 'sudeste',
  PR: 'sul', RS: 'sul', SC: 'sul',
};

const arredondar = (n, casas = 1) => Math.round(n * 10 ** casas) / 10 ** casas;
const moeda = (n) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** A área mais forte vira 1; as demais ficam proporcionais a ela (0 a 1). */
function normalizarAfinidades(pontuacao) {
  const valores = Object.values(pontuacao);
  const maximo = valores.length ? Math.max(...valores) : 0;
  const saida = {};
  for (const [slug, valor] of Object.entries(pontuacao)) {
    saida[slug] = maximo > 0 ? valor / maximo : 0;
  }
  return saida;
}

/** 0 = fora do alcance do aluno (curso será descartado). */
function fatorRegional(curso, { uf, regiao }) {
  if (!uf && !regiao) return 1;
  if (curso.modalidade === 'ead') return 0.8; // estudável de qualquer lugar
  if (uf && curso.uf === uf) return 1;
  if (regiao && curso.regiao === regiao) return uf ? 0.6 : 1;
  return 0;
}

/** 0 = acima do orçamento (curso será descartado). Mais barato pontua mais. */
function fatorOrcamento(curso, orcamentoMax) {
  if (orcamentoMax === undefined || orcamentoMax === null) return 1;
  if (curso.mensalidade === 0) return 1;
  if (curso.mensalidade > orcamentoMax) return 0;
  return 1 - 0.5 * (curso.mensalidade / orcamentoMax);
}

function fatorMercado(curso) {
  return curso.mercado_nivel ? curso.mercado_nivel / 5 : 0.5;
}

function montarMotivos(curso, fatores, { uf, regiao, orcamentoMax }, nomeArea) {
  const motivos = [];
  if (fatores.afinidade >= 0.99) motivos.push(`Combina com seu perfil: ${nomeArea} foi sua área de maior afinidade.`);
  else if (fatores.afinidade >= 0.6) motivos.push(`Tem boa afinidade com seu perfil em ${nomeArea}.`);
  else motivos.push(`Afinidade menor com seu perfil (${nomeArea}) — vale como alternativa.`);

  if (curso.modalidade === 'ead') motivos.push('É a distância (EAD): dá para estudar de onde você estiver.');
  else if (uf && curso.uf === uf) motivos.push(`Fica em ${curso.cidade}/${curso.uf}, no seu estado.`);
  else if (regiao && curso.regiao === regiao) motivos.push(`Fica em ${curso.cidade}/${curso.uf}, na sua região.`);

  if (curso.mensalidade === 0) motivos.push('Gratuito (instituição pública).');
  else if (orcamentoMax !== undefined && orcamentoMax !== null) motivos.push(`Mensalidade de ${moeda(curso.mensalidade)} cabe no seu orçamento de ${moeda(orcamentoMax)}.`);
  else motivos.push(`Mensalidade de ${moeda(curso.mensalidade)}.`);

  if (curso.mercado_nivel) motivos.push(`Mercado de trabalho da carreira: nível ${curso.mercado_nivel} de 5.`);
  return motivos;
}

/**
 * @param {object[]} cursos  linhas de cursos (com area, area_nome, mercado_nivel, mensalidade numérica)
 * @param {object} perfil
 * @param {Record<string, number>} perfil.pontuacao  pontos (ou percentuais) por área
 * @param {string} [perfil.uf]
 * @param {string} [perfil.regiao]
 * @param {number} [perfil.orcamentoMax]  mensalidade máxima em reais
 * @param {number} [limite]
 */
function recomendarCursos(cursos, perfil, limite = 10) {
  const afinidades = normalizarAfinidades(perfil.pontuacao);
  const uf = perfil.uf ? perfil.uf.toUpperCase() : undefined;
  const regiao = perfil.regiao || (uf ? REGIAO_POR_UF[uf] : undefined);
  const contexto = { uf, regiao, orcamentoMax: perfil.orcamentoMax };

  const avaliados = [];
  for (const curso of cursos) {
    const fatores = {
      afinidade: afinidades[curso.area] ?? 0,
      regional: fatorRegional(curso, contexto),
      orcamento: fatorOrcamento(curso, contexto.orcamentoMax),
      mercado: fatorMercado(curso),
    };
    if (fatores.regional === 0 || fatores.orcamento === 0) continue; // fora da realidade do aluno

    const score = 100 * (
      PESOS.afinidade * fatores.afinidade +
      PESOS.regional * fatores.regional +
      PESOS.orcamento * fatores.orcamento +
      PESOS.mercado * fatores.mercado
    );

    avaliados.push({
      ...curso,
      score: arredondar(score),
      compatibilidade: {
        afinidade: arredondar(fatores.afinidade * 100, 0),
        regiao: arredondar(fatores.regional * 100, 0),
        orcamento: arredondar(fatores.orcamento * 100, 0),
        mercado: arredondar(fatores.mercado * 100, 0),
      },
      motivos: montarMotivos(curso, fatores, contexto, curso.area_nome),
      custo_total_estimado: arredondar(curso.mensalidade * curso.duracao_meses, 2),
    });
  }

  avaliados.sort((a, b) => b.score - a.score || a.mensalidade - b.mensalidade || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { total_candidatos: avaliados.length, recomendacoes: avaliados.slice(0, limite) };
}

module.exports = { recomendarCursos, normalizarAfinidades, REGIAO_POR_UF, PESOS };
