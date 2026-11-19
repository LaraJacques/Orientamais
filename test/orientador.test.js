// Integração do painel do orientador: turmas, consentimento, notas e análise.
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
const senha = 'senhaSegura123';
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ORDEM = ['exatas', 'saude', 'criativas', 'negocios', 'humanas'];

async function cadastrar(corpo) {
  const res = await api.post('/api/auth/registro').send({ senha, ...corpo });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}
async function fazerTeste(token, area) {
  const { body } = await api.get('/api/quiz/perguntas');
  const respostas = body.perguntas.map((p) => ({ pergunta_id: p.id, opcao_id: p.opcoes[ORDEM.indexOf(area)].id }));
  const res = await api.post('/api/quiz/respostas').set(auth(token)).send({ respostas });
  assert.equal(res.status, 201);
}

let orientador; let outraEscolaOrientador; let turma; const alunos = {};

test.before(async () => {
  if (opcoes.skip) return;
  pool = criarPool(url);
  await migrar(pool);
  await pool.query('TRUNCATE notas, respostas, tentativas, usuarios, turmas, escolas RESTART IDENTITY CASCADE');
  await popular(pool, { demo: true });
  await pool.query(`INSERT INTO escolas (nome, codigo_orientador) VALUES ('Outra Escola', 'OUTRA-ESCOLA')`);
  api = request(criarApp(pool));

  orientador = await cadastrar({ nome: 'Marta Orientadora', email: 'marta@escola.com', papel: 'orientador', codigo_escola: 'ORIENTADOR-DEMO' });
  outraEscolaOrientador = await cadastrar({ nome: 'Outra', email: 'outra@escola.com', papel: 'orientador', codigo_escola: 'OUTRA-ESCOLA' });
  const t = await api.post('/api/orientador/turmas').set(auth(orientador.token)).send({ nome: '3º Ano B', ano_letivo: 2026 });
  assert.equal(t.status, 201);
  turma = t.body;
  for (const [chave, extra] of Object.entries({
    ana: { consentimento_orientador: true, area: 'exatas' },
    bia: { consentimento_orientador: true, area: 'exatas' },
    caio: { consentimento_orientador: true, area: 'saude' },
    dani: { consentimento_orientador: false, area: 'humanas' }, // não autorizou
  })) {
    const r = await cadastrar({ nome: chave.toUpperCase(), email: `${chave}@aluno.com`, papel: 'aluno', codigo_turma: turma.codigo_acesso, consentimento_orientador: extra.consentimento_orientador });
    alunos[chave] = { ...r, area: extra.area };
    await fazerTeste(r.token, extra.area);
  }
});
test.after(async () => { if (pool) await pool.end(); });

test('turma criada tem código gerado e o aluno entra com ele', opcoes, async () => {
  assert.match(turma.codigo_acesso, /^T-[0-9A-F]{8}$/);
  assert.equal(alunos.ana.usuario.consentimento_orientador, true);
  assert.equal(alunos.dani.usuario.consentimento_orientador, false);
});

test('novo código da turma invalida o antigo e só vale para a própria escola', opcoes, async () => {
  const velho = turma.codigo_acesso;
  const negado = await api.post(`/api/orientador/turmas/${turma.id}/novo-codigo`).set(auth(outraEscolaOrientador.token));
  assert.equal(negado.status, 404);
  const res = await api.post(`/api/orientador/turmas/${turma.id}/novo-codigo`).set(auth(orientador.token));
  assert.equal(res.status, 200);
  assert.notEqual(res.body.codigo_acesso, velho);
  const tentaVelho = await api.post('/api/auth/registro').send({ senha, nome: 'Tarde', email: 'tarde@aluno.com', papel: 'aluno', codigo_turma: velho });
  assert.equal(tentaVelho.status, 400);
  turma = { ...turma, ...res.body };
});

test('lista de alunos: sem autorização o orientador vê só o nome', opcoes, async () => {
  const res = await api.get(`/api/orientador/turmas/${turma.id}/alunos`).set(auth(orientador.token));
  assert.equal(res.status, 200);
  assert.equal(res.body.alunos.length, 4);
  const dani = res.body.alunos.find((a) => a.nome === 'DANI');
  assert.deepEqual([dani.autorizou, dani.fez_teste, dani.area_principal, dani.media_geral], [false, false, null, null]);
  const ana = res.body.alunos.find((a) => a.nome === 'ANA');
  assert.equal(ana.area_principal, 'exatas');
});

test('ficha individual: 403 sem autorização, 404 para outra escola, e aluno não acessa', opcoes, async () => {
  const sem = await api.get(`/api/orientador/alunos/${alunos.dani.usuario.id}`).set(auth(orientador.token));
  assert.equal(sem.status, 403);
  const outra = await api.get(`/api/orientador/alunos/${alunos.ana.usuario.id}`).set(auth(outraEscolaOrientador.token));
  assert.equal(outra.status, 404);
  const aluno = await api.get(`/api/orientador/alunos/${alunos.ana.usuario.id}`).set(auth(alunos.ana.token));
  assert.equal(aluno.status, 403);
  const semNotas = await api.put(`/api/orientador/alunos/${alunos.dani.usuario.id}/notas`).set(auth(orientador.token))
    .send({ periodo: 1, notas: [{ disciplina: 'Artes', nota: 7 }] });
  assert.equal(semNotas.status, 403);
});

test('lançar notas, corrigir e ver a ficha com respostas e análise', opcoes, async () => {
  const id = alunos.ana.usuario.id;
  const put = (periodo, notas) => api.put(`/api/orientador/alunos/${id}/notas`).set(auth(orientador.token)).send({ periodo, notas });
  assert.equal((await put(1, [{ disciplina: 'Matemática', nota: 9 }, { disciplina: 'Física', nota: 9.5 }, { disciplina: 'Artes', nota: 5 }])).status, 200);
  assert.equal((await put(2, [{ disciplina: 'Matemática', nota: 9 }, { disciplina: 'Artes', nota: 3.5 }])).status, 200);
  const corrigida = await put(2, [{ disciplina: 'Artes', nota: 4 }]); // mesma disciplina/bimestre: atualiza, não duplica
  assert.equal(corrigida.body.notas.filter((x) => x.disciplina === 'Artes').length, 2);

  const res = await api.get(`/api/orientador/alunos/${id}`).set(auth(orientador.token));
  assert.equal(res.status, 200);
  assert.equal(res.body.teste.respostas.length, 6);
  assert.equal(res.body.teste.area_principal, 'exatas');
  assert.equal(res.body.analise.alinhamento, 'alinhado');
  assert.ok(res.body.analise.atencao.some((a) => a.disciplina === 'Artes'));
});

test('validação das notas', opcoes, async () => {
  const id = alunos.ana.usuario.id;
  const put = (corpo) => api.put(`/api/orientador/alunos/${id}/notas`).set(auth(orientador.token)).send(corpo);
  assert.equal((await put({ periodo: 5, notas: [{ disciplina: 'Artes', nota: 7 }] })).status, 400);
  assert.equal((await put({ periodo: 1, notas: [{ disciplina: 'Artes', nota: 11 }] })).status, 400);
  assert.equal((await put({ periodo: 1, notas: [{ disciplina: 'Culinária', nota: 7 }] })).status, 400);
  assert.equal((await put({ periodo: 1, notas: [{ disciplina: 'Artes', nota: 7 }, { disciplina: 'Artes', nota: 8 }] })).status, 400);
});

test('remover nota', opcoes, async () => {
  const id = alunos.ana.usuario.id;
  const del = await api.delete(`/api/orientador/alunos/${id}/notas?disciplina=Artes&periodo=2`).set(auth(orientador.token));
  assert.equal(del.status, 204);
  const de_novo = await api.delete(`/api/orientador/alunos/${id}/notas?disciplina=Artes&periodo=2`).set(auth(orientador.token));
  assert.equal(de_novo.status, 404);
});

test('resumo da turma: notas agregadas só com 3+ alunos e sem expor quem não autorizou', opcoes, async () => {
  const ant = await api.get(`/api/orientador/resumo?turma_id=${turma.id}`).set(auth(orientador.token));
  assert.equal(ant.body.notas.dados_ocultos, true); // só a Ana tem notas até aqui
  assert.equal(ant.body.notas.alunos_atencao.length, 0);

  for (const chave of ['bia', 'caio']) {
    const r = await api.put(`/api/orientador/alunos/${alunos[chave].usuario.id}/notas`).set(auth(orientador.token))
      .send({ periodo: 1, notas: [{ disciplina: 'Matemática', nota: chave === 'bia' ? 4 : 5 }, { disciplina: 'Biologia', nota: 5 }] });
    assert.equal(r.status, 200);
  }
  const res = await api.get(`/api/orientador/resumo?turma_id=${turma.id}`).set(auth(orientador.token));
  assert.equal(res.body.notas.dados_ocultos, false);
  assert.equal(res.body.notas.alunos_com_notas, 3);
  const mat = res.body.notas.por_disciplina.find((d) => d.disciplina === 'Matemática');
  assert.equal(mat.alunos, 3);
  assert.ok(res.body.notas.alunos_atencao.some((a) => a.nome === 'BIA'));
  assert.ok(!res.body.notas.alunos_atencao.some((a) => a.nome === 'DANI'));
});

test('aluno retira a autorização e o orientador perde o acesso na hora', opcoes, async () => {
  const id = alunos.caio.usuario.id;
  const ok = await api.get(`/api/orientador/alunos/${id}`).set(auth(orientador.token));
  assert.equal(ok.status, 200);
  const patch = await api.patch('/api/auth/consentimento').set(auth(alunos.caio.token)).send({ consentimento_orientador: false });
  assert.equal(patch.status, 200);
  const negado = await api.get(`/api/orientador/alunos/${id}`).set(auth(orientador.token));
  assert.equal(negado.status, 403);
  const resumo = await api.get(`/api/orientador/resumo?turma_id=${turma.id}`).set(auth(orientador.token));
  assert.equal(resumo.body.notas.alunos_com_notas, 2);
  assert.equal(resumo.body.notas.dados_ocultos, true);
});

test('só aluno em turma pode autorizar; orientador não usa essa rota', opcoes, async () => {
  const solto = await cadastrar({ nome: 'Solto', email: 'solto@aluno.com', papel: 'aluno' });
  const r = await api.patch('/api/auth/consentimento').set(auth(solto.token)).send({ consentimento_orientador: true });
  assert.equal(r.status, 400);
  const o = await api.patch('/api/auth/consentimento').set(auth(orientador.token)).send({ consentimento_orientador: true });
  assert.equal(o.status, 403);
});
