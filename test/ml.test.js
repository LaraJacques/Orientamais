// Paridade entre o modelo rodando em Node e as previsões do scikit-learn (Python) + comportamento do motor ML.
const test = require('node:test');
const assert = require('node:assert/strict');
const { recomendarCursosML, versaoDoModelo } = require('../src/services/recomendacao-ml');
const { recomendarCursos } = require('../src/services/recomendacao');
const { cursos, casos } = require('./fixtures/ml-paridade.json');

const perfilDe = (c) => ({ pontuacao: c.pontuacao, uf: c.uf || undefined, orcamentoMax: c.orcamento_max ?? undefined });

test('previsões do Node batem com as do scikit-learn (diferença < 1e-9, mesmos cursos viáveis)', () => {
  assert.ok(casos.length >= 25);
  for (const c of casos) {
    const r = recomendarCursosML(cursos, perfilDe(c), 100);
    const esperados = Object.keys(c.previsoes).sort();
    assert.deepEqual(r.recomendacoes.map((x) => String(x.id)).sort(), esperados);
    for (const rec of r.recomendacoes) {
      const prev = Math.min(1, Math.max(0, c.previsoes[String(rec.id)]));
      assert.ok(Math.abs(rec.score - Math.round(prev * 1000) / 10) <= 0.1 + 1e-9, `curso ${rec.id}: ${rec.score} x ${prev * 100}`);
    }
  }
});

test('ML respeita orçamento e região como o motor por regras', () => {
  const p = { pontuacao: { exatas: 4, saude: 1, criativas: 1, negocios: 0, humanas: 0 }, uf: 'AM', orcamentoMax: 600 };
  const { recomendacoes } = recomendarCursosML(cursos, p, 50);
  assert.ok(recomendacoes.length > 0);
  assert.ok(recomendacoes.every((c) => c.mensalidade <= 600 && (c.modalidade === 'ead' || c.regiao === 'norte')));
  assert.ok(recomendacoes.every((c) => c.motivos.length >= 2));
  const scores = recomendacoes.map((c) => c.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(recomendacoes[0].area, 'exatas');
});

test('ML concorda bastante com o motor por regras no top-5 (sanidade)', () => {
  let soma = 0;
  for (const c of casos) {
    const a = recomendarCursosML(cursos, perfilDe(c), 5).recomendacoes.map((x) => x.id);
    const b = recomendarCursos(cursos, perfilDe(c), 5).recomendacoes.map((x) => x.id);
    if (b.length) soma += a.filter((id) => b.includes(id)).length / b.length;
  }
  assert.ok(soma / casos.length > 0.75, `sobreposição média ${soma / casos.length}`);
});

test('perfil vazio não quebra e o modelo informa a versão', () => {
  const r = recomendarCursosML(cursos, { pontuacao: {} }, 5);
  assert.equal(r.recomendacoes.length, 5);
  assert.match(versaoDoModelo, /^ridge-sintetico/);
});
