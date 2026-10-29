const test = require('node:test');
const assert = require('node:assert/strict');
const { recomendarCursos, normalizarAfinidades } = require('../src/services/recomendacao');

const curso = (extra) => ({
  id: 1, nome: 'Curso', instituicao: 'Inst', cidade: 'Manaus', uf: 'AM', regiao: 'norte',
  modalidade: 'presencial', mensalidade: 0, duracao_meses: 48, area: 'exatas', area_nome: 'Exatas & Tecnologia',
  mercado_nivel: 4, ...extra,
});

const pontuacao = { exatas: 5, saude: 1, criativas: 0, negocios: 0, humanas: 0 };

test('normaliza afinidades: a área mais forte vale 1', () => {
  const n = normalizarAfinidades(pontuacao);
  assert.equal(n.exatas, 1);
  assert.equal(n.saude, 0.2);
  assert.equal(n.humanas, 0);
});

test('descarta cursos acima do orçamento, mas mantém os gratuitos', () => {
  const cursos = [
    curso({ id: 1, nome: 'Caro', mensalidade: 1500 }),
    curso({ id: 2, nome: 'Cabe', mensalidade: 400 }),
    curso({ id: 3, nome: 'Grátis', mensalidade: 0 }),
  ];
  const { recomendacoes } = recomendarCursos(cursos, { pontuacao, uf: 'AM', orcamentoMax: 500 });
  assert.deepEqual(recomendacoes.map((c) => c.nome).sort(), ['Cabe', 'Grátis']);
});

test('orçamento zero só aceita cursos gratuitos', () => {
  const cursos = [curso({ id: 1, mensalidade: 100 }), curso({ id: 2, mensalidade: 0 })];
  const { recomendacoes } = recomendarCursos(cursos, { pontuacao, orcamentoMax: 0 });
  assert.equal(recomendacoes.length, 1);
  assert.equal(recomendacoes[0].mensalidade, 0);
});

test('descarta presencial de outra região, mas mantém EAD de qualquer lugar', () => {
  const cursos = [
    curso({ id: 1, nome: 'Presencial SP', uf: 'SP', regiao: 'sudeste', cidade: 'São Paulo' }),
    curso({ id: 2, nome: 'EAD SP', uf: 'SP', regiao: 'sudeste', cidade: 'São Paulo', modalidade: 'ead' }),
    curso({ id: 3, nome: 'Presencial AM' }),
  ];
  const { recomendacoes } = recomendarCursos(cursos, { pontuacao, uf: 'AM' });
  assert.deepEqual(recomendacoes.map((c) => c.nome).sort(), ['EAD SP', 'Presencial AM']);
});

test('curso no mesmo estado pontua mais que o da mesma região', () => {
  const cursos = [
    curso({ id: 1, nome: 'Outro estado', uf: 'PA', regiao: 'norte', cidade: 'Belém' }),
    curso({ id: 2, nome: 'Mesmo estado' }),
  ];
  const { recomendacoes } = recomendarCursos(cursos, { pontuacao, uf: 'AM' });
  assert.equal(recomendacoes[0].nome, 'Mesmo estado');
  assert.ok(recomendacoes[0].score > recomendacoes[1].score);
});

test('área com mais afinidade vem primeiro', () => {
  const cursos = [
    curso({ id: 1, nome: 'Saúde', area: 'saude', area_nome: 'Saúde' }),
    curso({ id: 2, nome: 'Exatas' }),
  ];
  const { recomendacoes } = recomendarCursos(cursos, { pontuacao });
  assert.equal(recomendacoes[0].nome, 'Exatas');
});

test('sem localização nem orçamento ninguém é descartado', () => {
  const cursos = [curso({ id: 1, uf: 'RS', regiao: 'sul', mensalidade: 3000 }), curso({ id: 2 })];
  assert.equal(recomendarCursos(cursos, { pontuacao }).total_candidatos, 2);
});

test('inclui motivos legíveis e custo total estimado', () => {
  const { recomendacoes } = recomendarCursos([curso({ mensalidade: 450, duracao_meses: 48 })], { pontuacao, uf: 'AM', orcamentoMax: 600 });
  assert.equal(recomendacoes[0].custo_total_estimado, 21600);
  assert.ok(recomendacoes[0].motivos.some((m) => m.includes('cabe no seu orçamento')));
  assert.ok(recomendacoes[0].motivos.some((m) => m.includes('no seu estado')));
});

test('respeita o limite de resultados', () => {
  const cursos = Array.from({ length: 8 }, (_, i) => curso({ id: i, nome: `C${i}` }));
  const r = recomendarCursos(cursos, { pontuacao }, 3);
  assert.equal(r.recomendacoes.length, 3);
  assert.equal(r.total_candidatos, 8);
});
