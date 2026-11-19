// Integração: rota /api/recomendacoes com os dois motores.
process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { criarPool } = require('../src/db');
const { criarApp } = require('../src/app');
const { migrar } = require('../db/migrate');
const { popular } = require('../db/seed');

const url = process.env.TEST_DATABASE_URL;
const opcoes = !url
  ? { skip: 'defina TEST_DATABASE_URL' }
  : !/test/i.test(new URL(url).pathname) ? { skip: 'banco de teste precisa ter "test" no nome' } : {};

let pool; let api;
const corpo = { pontuacao: { exatas: 4, saude: 1, criativas: 1, negocios: 0, humanas: 0 }, uf: 'AM', orcamento_max: 600, limite: 5 };

test.before(async () => {
  if (opcoes.skip) return;
  pool = criarPool(url);
  await migrar(pool);
  await popular(pool, { demo: false });
  api = request(criarApp(pool));
});
test.after(async () => { if (pool) await pool.end(); });

test('padrão é o motor por regras', opcoes, async () => {
  const res = await api.post('/api/recomendacoes').send(corpo);
  assert.equal(res.status, 200);
  assert.equal(res.body.motor, 'regras');
});

test('modelo=ml usa o modelo treinado e mantém o contrato da resposta', opcoes, async () => {
  const res = await api.post('/api/recomendacoes').send({ ...corpo, modelo: 'ml' });
  assert.equal(res.status, 200);
  assert.equal(res.body.motor, 'ml');
  const { recomendacoes } = res.body;
  assert.equal(recomendacoes.length, 5);
  assert.ok(recomendacoes.every((c) => c.mensalidade <= 600 && c.motivos.length >= 2 && c.compatibilidade));
  assert.equal(recomendacoes[0].area, 'exatas');
});

test('modelo inválido é rejeitado', opcoes, async () => {
  const res = await api.post('/api/recomendacoes').send({ ...corpo, modelo: 'xyz' });
  assert.equal(res.status, 400);
});
