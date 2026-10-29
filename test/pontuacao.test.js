const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularPontuacao } = require('../src/services/pontuacao');

const areas = [
  { slug: 'exatas', nome: 'Exatas & Tecnologia' },
  { slug: 'saude', nome: 'Saúde' },
  { slug: 'criativas', nome: 'Criativas' },
  { slug: 'negocios', nome: 'Negócios' },
  { slug: 'humanas', nome: 'Humanas' },
];
const escolhas = (...slugs) => slugs.map((area_slug) => ({ area_slug, peso: 1 }));

test('soma pontos e define a área principal', () => {
  const r = calcularPontuacao(escolhas('exatas', 'exatas', 'exatas', 'saude', 'criativas', 'exatas'), areas);
  assert.equal(r.area_principal, 'exatas');
  assert.equal(r.pontos.exatas, 4);
  assert.equal(r.ranking[0].percentual, 66.7);
  assert.equal(r.empate, false);
});

test('percentuais somam 100%', () => {
  const r = calcularPontuacao(escolhas('exatas', 'saude', 'saude', 'humanas', 'negocios', 'criativas'), areas);
  const soma = r.ranking.reduce((s, x) => s + x.percentual, 0);
  assert.ok(Math.abs(soma - 100) < 0.5);
});

test('detecta empate entre áreas', () => {
  const r = calcularPontuacao(escolhas('exatas', 'exatas', 'saude', 'saude', 'criativas', 'negocios'), areas);
  assert.equal(r.empate, true);
  assert.deepEqual([...r.areas_empatadas].sort(), ['exatas', 'saude']);
});

test('sem respostas não há área principal', () => {
  const r = calcularPontuacao([], areas);
  assert.equal(r.area_principal, null);
  assert.equal(r.empate, false);
});

test('rejeita área desconhecida', () => {
  assert.throws(() => calcularPontuacao(escolhas('astrologia'), areas), /Área desconhecida/);
});
