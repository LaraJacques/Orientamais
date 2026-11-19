const test = require('node:test');
const assert = require('node:assert/strict');
const { resumoPorDisciplina, desempenhoPorArea, analisarAluno } = require('../src/services/analise');

const n = (disciplina, periodo, nota) => ({ disciplina, periodo, nota });

test('resumo: média, última nota e variação entre bimestres', () => {
  const r = resumoPorDisciplina([n('Matemática', 1, 8), n('Matemática', 2, 6), n('Artes', 1, 9)]);
  const mat = r.find((d) => d.disciplina === 'Matemática');
  assert.equal(mat.media, 7);
  assert.equal(mat.ultima_nota, 6);
  assert.equal(mat.variacao, -2);
  assert.equal(r.find((d) => d.disciplina === 'Artes').variacao, null);
});

test('desempenho por área usa o mapa disciplina → área', () => {
  const resumo = resumoPorDisciplina([n('Física', 1, 9), n('Matemática', 1, 7), n('Biologia', 1, 5)]);
  const areas = desempenhoPorArea(resumo);
  assert.equal(areas[0].area, 'exatas'); // (9+7)/2 = 8
  assert.equal(areas[0].media, 8);
  assert.equal(areas.find((a) => a.area === 'saude').media, 5);
});

test('perfil alinhado com as notas', () => {
  const a = analisarAluno({ areaPrincipal: 'exatas', notas: [n('Matemática', 1, 9), n('Física', 1, 9), n('História', 1, 6), n('Artes', 1, 6)] });
  assert.equal(a.alinhamento, 'alinhado');
  assert.ok(a.destaques.includes('Matemática'));
});

test('perfil divergente: interesse maior que o desempenho na área', () => {
  const a = analisarAluno({ areaPrincipal: 'exatas', notas: [n('Matemática', 1, 5), n('Física', 1, 5), n('História', 1, 9), n('Artes', 1, 9)] });
  assert.equal(a.alinhamento, 'divergente');
  assert.match(a.observacoes.join(' '), /Humanas|Criativas/); // sugere olhar onde vai melhor
});

test('atenção: média abaixo de 6 e queda de 1 ponto', () => {
  const a = analisarAluno({ areaPrincipal: null, notas: [n('Química', 1, 5), n('Biologia', 1, 9), n('Biologia', 2, 7.5)] });
  const disciplinas = a.atencao.map((x) => x.disciplina);
  assert.deepEqual(disciplinas.sort(), ['Biologia', 'Química']);
  assert.match(a.observacoes.join(' '), /ainda não fez o teste/);
});

test('sem notas e sem teste devolve aviso em vez de quebrar', () => {
  const a = analisarAluno({ areaPrincipal: null, notas: [] });
  assert.equal(a.media_geral, null);
  assert.equal(a.alinhamento, 'sem_dados');
  assert.equal(a.observacoes.length, 1);
});
