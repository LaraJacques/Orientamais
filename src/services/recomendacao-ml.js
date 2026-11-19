// Motor de recomendação com aprendizado de máquina (modelo linear Ridge treinado em Python/scikit-learn na PoC
// poc-fastapi/ e exportado para JSON). Roda dentro do Node: sem Python e sem servidor extra.
//
// ATENÇÃO: o modelo atual foi treinado com dados SIMULADOS (ainda não há alunos reais). Por isso o padrão do site
// continua sendo o motor por regras; este motor só é usado com MODELO_RECOMENDACAO=ml (ou "modelo": "ml" na requisição).
// Os atributos abaixo precisam ser idênticos aos de poc-fastapi/app/features.py (há teste de paridade).

const modelo = require('./modelo-ml.json');
const {
  normalizarAfinidades, REGIAO_POR_UF, fatorRegional, fatorOrcamento, fatorMercado, montarMotivos, arredondar,
} = require('./recomendacao');

const N_AREAS = modelo.areas.length;

function entropiaNormalizada(valores) {
  const total = valores.reduce((s, v) => s + v, 0);
  if (total <= 0) return 1;
  const h = valores.filter((v) => v > 0).reduce((s, v) => s - (v / total) * Math.log(v / total), 0);
  return h / Math.log(valores.length);
}

function contextoDoAluno(pontuacao) {
  const pts = modelo.areas.map((s) => Number(pontuacao[s] ?? 0));
  const total = pts.reduce((s, v) => s + v, 0);
  const ordem = pts.map((_, i) => i).sort((a, b) => pts[b] - pts[a] || a - b);
  const posicao = {}; const participacao = {};
  ordem.forEach((i, r) => { posicao[modelo.areas[i]] = r; });
  modelo.areas.forEach((s, i) => { participacao[s] = total > 0 ? pts[i] / total : 0; });
  return {
    afinidades: normalizarAfinidades(Object.fromEntries(modelo.areas.map((s, i) => [s, pts[i]]))),
    posicao, participacao, indefinicao: entropiaNormalizada(pts),
  };
}

function vetor(curso, ctx, f, orcamentoMax, informouLocal) {
  const mens = Number(curso.mensalidade);
  return [
    f.afinidade,
    ctx.posicao[curso.area] / (N_AREAS - 1),
    ctx.participacao[curso.area],
    ctx.indefinicao,
    f.regional, f.orcamento, f.mercado,
    mens / 1000,
    orcamentoMax ? mens / orcamentoMax : 0,
    curso.duracao_meses / 12,
    curso.nivel === 'tecnico' ? 1 : 0,
    curso.nivel !== 'tecnico' ? 1 : 0,
    curso.modalidade === 'ead' ? 1 : 0,
    curso.modalidade === 'hibrido' ? 1 : 0,
    curso.rede === 'publica' ? 1 : 0,
    mens === 0 ? 1 : 0,
    orcamentoMax !== undefined && orcamentoMax !== null ? 1 : 0,
    informouLocal ? 1 : 0,
  ];
}

/** Relevância prevista (0 a 1) = intercepto + Σ coef × (atributo − média) / escala. */
function prever(x) {
  let y = modelo.intercepto;
  for (let i = 0; i < x.length; i += 1) y += modelo.coeficientes[i] * ((x[i] - modelo.media[i]) / modelo.escala[i]);
  return y;
}

function recomendarCursosML(cursos, perfil, limite = 10) {
  const uf = perfil.uf ? perfil.uf.toUpperCase() : undefined;
  const regiao = perfil.regiao || (uf ? REGIAO_POR_UF[uf] : undefined);
  const ctx = contextoDoAluno(perfil.pontuacao);
  const orcamentoMax = perfil.orcamentoMax;
  const avaliados = [];
  for (const curso of cursos) {
    const f = {
      afinidade: ctx.afinidades[curso.area] ?? 0,
      regional: fatorRegional(curso, { uf, regiao }),
      orcamento: fatorOrcamento(curso, orcamentoMax),
      mercado: fatorMercado(curso),
    };
    if (f.regional === 0 || f.orcamento === 0) continue; // restrições duras continuam sendo regra
    const relevancia = prever(vetor(curso, ctx, f, orcamentoMax, Boolean(uf || regiao)));
    avaliados.push({
      ...curso,
      score: arredondar(Math.min(1, Math.max(0, relevancia)) * 100),
      compatibilidade: {
        afinidade: arredondar(f.afinidade * 100, 0), regiao: arredondar(f.regional * 100, 0),
        orcamento: arredondar(f.orcamento * 100, 0), mercado: arredondar(f.mercado * 100, 0),
      },
      motivos: montarMotivos(curso, f, { uf, regiao, orcamentoMax }, curso.area_nome),
      custo_total_estimado: arredondar(curso.mensalidade * curso.duracao_meses, 2),
    });
  }
  avaliados.sort((a, b) => b.score - a.score || a.mensalidade - b.mensalidade || a.nome.localeCompare(b.nome, 'pt-BR'));
  return { total_candidatos: avaliados.length, recomendacoes: avaliados.slice(0, limite) };
}

module.exports = { recomendarCursosML, prever, contextoDoAluno, versaoDoModelo: modelo.versao };
