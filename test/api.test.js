// Testes de integração da API. Precisam de um PostgreSQL de teste:
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/orienta_test npm test
// O nome do banco PRECISA conter "test": o script apaga usuários, turmas e escolas ao começar.
process.env.NODE_ENV = 'test';
// Garante que nada neste arquivo use um banco que não seja o de teste (config lê DATABASE_URL ao carregar).
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { criarPool } = require('../src/db');
const { criarApp } = require('../src/app');
const { migrar } = require('../db/migrate');
const { popular } = require('../db/seed');

const url = process.env.TEST_DATABASE_URL;
const bancoDeTeste = url && /test/i.test(new URL(url).pathname);
const opcoes = !url
  ? { skip: 'defina TEST_DATABASE_URL para rodar os testes de integração' }
  : !bancoDeTeste ? { skip: 'TEST_DATABASE_URL precisa apontar para um banco com "test" no nome' } : {};

let pool;
let api;
const senha = 'senhaSegura123';

async function cadastrar(extra) {
  const res = await api.post('/api/auth/registro').send({ senha, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Responde ao teste escolhendo sempre a opção da área indicada (opcoes na ordem das áreas do seed).
async function responderTudoComArea(slug, token) {
  const { body } = await api.get('/api/quiz/perguntas');
  const ordemAreas = ['exatas', 'saude', 'criativas', 'negocios', 'humanas'];
  const respostas = body.perguntas.map((p) => ({ pergunta_id: p.id, opcao_id: p.opcoes[ordemAreas.indexOf(slug)].id }));
  const req = api.post('/api/quiz/respostas').send({ respostas });
  return token ? req.set(auth(token)) : req;
}

test.before(async () => {
  if (opcoes.skip) return;
  pool = criarPool(url);
  await migrar(pool);
  await pool.query('TRUNCATE respostas, tentativas, usuarios, turmas, escolas RESTART IDENTITY CASCADE');
  await popular(pool, { demo: true });
  api = request(criarApp(pool));
});
test.after(async () => { if (pool) await pool.end(); });

test('health responde ok', opcoes, async () => {
  const res = await api.get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('quiz: lista 6 perguntas com 5 opções e sem expor a área', opcoes, async () => {
  const { body } = await api.get('/api/quiz/perguntas');
  assert.equal(body.total, 6);
  assert.ok(body.perguntas.every((p) => p.opcoes.length === 5));
  assert.ok(!JSON.stringify(body).includes('area'));
});

test('quiz: anônimo recebe resultado sem salvar', opcoes, async () => {
  const res = await responderTudoComArea('exatas');
  assert.equal(res.status, 201);
  assert.equal(res.body.area_principal, 'exatas');
  assert.equal(res.body.salvo, false);
  assert.equal(res.body.ranking[0].percentual, 100);
  assert.ok(res.body.carreiras_sugeridas.length > 0);
  assert.ok(res.body.carreiras_sugeridas.every((c) => c.area === 'exatas'));
});

test('quiz: rejeita respostas incompletas, repetidas e opção de outra pergunta', opcoes, async () => {
  const { body } = await api.get('/api/quiz/perguntas');
  const [p1, p2] = body.perguntas;

  const incompleta = await api.post('/api/quiz/respostas').send({ respostas: [{ pergunta_id: p1.id, opcao_id: p1.opcoes[0].id }] });
  assert.equal(incompleta.status, 400);
  assert.equal(incompleta.body.detalhes.perguntas_faltantes.length, 5);

  const repetida = await api.post('/api/quiz/respostas').send({
    respostas: [{ pergunta_id: p1.id, opcao_id: p1.opcoes[0].id }, { pergunta_id: p1.id, opcao_id: p1.opcoes[1].id }],
  });
  assert.equal(repetida.status, 400);

  const trocada = await api.post('/api/quiz/respostas').send({ respostas: [{ pergunta_id: p1.id, opcao_id: p2.opcoes[0].id }] });
  assert.equal(trocada.status, 400);
  assert.match(trocada.body.erro, /não pertence/);
});

test('auth: cadastro, login, /me e erros', opcoes, async () => {
  const novo = await cadastrar({ nome: 'Ana Souza', email: 'ANA@exemplo.com', papel: 'aluno', codigo_turma: 'TURMA3A-DEMO' });
  assert.equal(novo.usuario.email, 'ana@exemplo.com');
  assert.ok(novo.usuario.turma_id);
  assert.ok(!('senha_hash' in novo.usuario));

  const login = await api.post('/api/auth/login').send({ email: 'ana@exemplo.com', senha });
  assert.equal(login.status, 200);
  const me = await api.get('/api/auth/me').set(auth(login.body.token));
  assert.equal(me.body.turma_nome, '3º Ano A');

  assert.equal((await api.post('/api/auth/login').send({ email: 'ana@exemplo.com', senha: 'errada123' })).status, 401);
  assert.equal((await api.post('/api/auth/login').send({ email: 'nao@existe.com', senha })).status, 401);
  assert.equal((await api.post('/api/auth/registro').send({ senha, nome: 'Ana 2', email: 'ana@exemplo.com', papel: 'aluno' })).status, 409);
  assert.equal((await api.post('/api/auth/registro').send({ nome: 'Fraca', email: 'f@e.com', papel: 'aluno', senha: '123' })).status, 400);
  assert.equal((await api.post('/api/auth/registro').send({ senha, nome: 'Zé', email: 'ze@e.com', papel: 'aluno', codigo_turma: 'XXXX' })).status, 400);
  assert.equal((await api.get('/api/auth/me')).status, 401);
  assert.equal((await api.get('/api/auth/me').set(auth('token.falso.aqui'))).status, 401);
});

test('auth: orientador exige código da escola válido', opcoes, async () => {
  const base = { nome: 'Prof. Lia', email: 'lia@escola.com', papel: 'orientador', senha };
  assert.equal((await api.post('/api/auth/registro').send(base)).status, 400);
  assert.equal((await api.post('/api/auth/registro').send({ ...base, codigo_escola: 'ERRADO' })).status, 400);
  const ok = await api.post('/api/auth/registro').send({ ...base, codigo_escola: 'ORIENTADOR-DEMO' });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.usuario.escola_id);
});

test('quiz: aluno logado grava a tentativa e recupera o último resultado', opcoes, async () => {
  const { token } = await cadastrar({ nome: 'Bia Lima', email: 'bia@exemplo.com', papel: 'aluno', codigo_turma: 'TURMA3A-DEMO' });
  assert.equal((await api.get('/api/quiz/resultado').set(auth(token))).status, 404);

  const res = await responderTudoComArea('saude', token);
  assert.equal(res.body.salvo, true);

  const ultimo = await api.get('/api/quiz/resultado').set(auth(token));
  assert.equal(ultimo.status, 200);
  assert.equal(ultimo.body.area_principal, 'saude');
  assert.equal(ultimo.body.tentativa_id, res.body.tentativa_id);
});

test('carreiras: lista, filtra, detalha e compara', opcoes, async () => {
  const todas = await api.get('/api/carreiras');
  assert.equal(todas.body.total, 12);

  const saude = await api.get('/api/carreiras?area=saude&q=');
  assert.deepEqual(saude.body.carreiras.map((c) => c.slug).sort(), ['enfermagem', 'medicina']);

  const detalhe = await api.get('/api/carreiras/medicina');
  assert.equal(detalhe.body.salario_medio, 14000);
  assert.equal(detalhe.body.demanda_rotulo, 'Muito alta');
  assert.equal((await api.get('/api/carreiras/inexistente')).status, 404);

  const cmp = await api.get('/api/carreiras/comparar?slugs=design,medicina,eng-software');
  assert.equal(cmp.status, 200);
  assert.deepEqual(cmp.body.carreiras.map((c) => c.slug), ['design', 'medicina', 'eng-software']);
  assert.equal(cmp.body.destaques.maior_salario_maximo, 'medicina');
  assert.equal(cmp.body.destaques.menor_duracao, 'design'); // empata com eng-software (4 anos); design vem primeiro

  assert.equal((await api.get('/api/carreiras/comparar?slugs=a,b,c,d')).status, 400);
  assert.equal((await api.get('/api/carreiras/comparar')).status, 400);
  assert.equal((await api.get('/api/carreiras/comparar?slugs=medicina,medicina')).status, 400);
  assert.equal((await api.get('/api/carreiras/comparar?slugs=medicina,nada')).status, 404);
});

test('cursos: filtra por região, orçamento e ignora filtros vazios', opcoes, async () => {
  const vazio = await api.get('/api/cursos?regiao=&orcamento_max=&area=&limite=100');
  assert.equal(vazio.status, 200);
  assert.equal(vazio.body.total, 22);

  const gratisNorte = await api.get('/api/cursos?regiao=norte&orcamento_max=0&limite=100');
  assert.ok(gratisNorte.body.total > 0);
  assert.ok(gratisNorte.body.cursos.every((c) => c.mensalidade === 0 && c.regiao === 'norte'));

  // por padrão EAD de outras regiões entra; com incluir_ead=false, não
  const comEad = await api.get('/api/cursos?regiao=norte&orcamento_max=300&limite=100');
  assert.ok(comEad.body.cursos.some((c) => c.modalidade === 'ead' && c.regiao !== 'norte'));
  const semEad = await api.get('/api/cursos?regiao=norte&orcamento_max=300&incluir_ead=false&limite=100');
  assert.ok(semEad.body.cursos.every((c) => c.regiao === 'norte'));

  const am = await api.get('/api/cursos?uf=am&incluir_ead=false&area=exatas&limite=100');
  assert.ok(am.body.cursos.every((c) => c.uf === 'AM' && c.area === 'exatas'));

  const pag = await api.get('/api/cursos?limite=5&pagina=2');
  assert.equal(pag.body.cursos.length, 5);
  assert.equal(pag.body.total, 22);

  assert.equal((await api.get('/api/cursos?regiao=atlantida')).status, 400);
  assert.equal((await api.get('/api/cursos?orcamento_max=abc')).status, 400);
});

test('recomendações: respeita perfil, orçamento e localização', opcoes, async () => {
  const res = await api.post('/api/recomendacoes').send({
    pontuacao: { exatas: 5, saude: 1, criativas: 0, negocios: 0, humanas: 0 },
    uf: 'AM', orcamento_max: 500, limite: 5,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.origem_do_perfil, 'informada');
  const { recomendacoes } = res.body;
  assert.ok(recomendacoes.length > 0);
  assert.equal(recomendacoes[0].area, 'exatas');
  assert.ok(recomendacoes.every((c) => c.mensalidade <= 500));
  assert.ok(recomendacoes.every((c) => c.modalidade === 'ead' || c.regiao === 'norte'));
  assert.ok(recomendacoes[0].motivos.length >= 3);

  assert.equal((await api.post('/api/recomendacoes').send({})).status, 400); // anônimo sem pontuação
  assert.equal((await api.post('/api/recomendacoes').send({ pontuacao: { astrologia: 3 } })).status, 400);

  const semResultado = await api.post('/api/recomendacoes').send({ pontuacao: { exatas: 1 }, orcamento_max: 0, uf: 'RS', modalidade: 'ead' });
  assert.equal(semResultado.body.recomendacoes.length, 0);
  assert.ok(semResultado.body.dica);
});

test('recomendações: usa o último teste do aluno logado', opcoes, async () => {
  const { token } = await cadastrar({ nome: 'Caio Reis', email: 'caio@exemplo.com', papel: 'aluno' });
  await responderTudoComArea('criativas', token);
  const res = await api.post('/api/recomendacoes').set(auth(token)).send({ uf: 'AM', limite: 3 });
  assert.equal(res.body.origem_do_perfil, 'ultimo_teste');
  assert.equal(res.body.recomendacoes[0].area, 'criativas');
});

test('orientador: aluno não acessa e sem token é 401', opcoes, async () => {
  const { token } = await cadastrar({ nome: 'Duda Neves', email: 'duda@exemplo.com', papel: 'aluno' });
  assert.equal((await api.get('/api/orientador/resumo')).status, 401);
  assert.equal((await api.get('/api/orientador/resumo').set(auth(token))).status, 403);
  assert.equal((await api.post('/api/orientador/turmas').set(auth(token)).send({ nome: 'X1', ano_letivo: 2026 })).status, 403);
});

test('orientador: painel oculta dados de grupos pequenos e agrega quando há alunos suficientes', opcoes, async () => {
  const { rows: [{ id: turmaId }] } = await pool.query("SELECT id FROM turmas WHERE codigo_acesso = 'TURMA3A-DEMO'");
  await pool.query("DELETE FROM usuarios WHERE papel = 'aluno'"); // começa a turma do zero
  const { token } = await cadastrar({ nome: 'Prof. Raul', email: 'raul@escola.com', papel: 'orientador', codigo_escola: 'ORIENTADOR-DEMO' });

  const aluno = (n) => cadastrar({ nome: `Aluno ${n}`, email: `aluno${n}@exemplo.com`, papel: 'aluno', codigo_turma: 'TURMA3A-DEMO' });
  const [a1, a2, a3, a4] = await Promise.all([1, 2, 3, 4].map(aluno));

  await responderTudoComArea('exatas', a1.token);
  await responderTudoComArea('exatas', a2.token);
  const pequeno = await api.get(`/api/orientador/resumo?turma_id=${turmaId}`).set(auth(token));
  assert.equal(pequeno.status, 200);
  assert.equal(pequeno.body.dados_ocultos, true);
  assert.equal(pequeno.body.alunos_com_teste, 2);
  assert.deepEqual(pequeno.body.distribuicao, []);

  await responderTudoComArea('saude', a3.token);
  // a4 refaz o teste: só o mais recente conta
  await responderTudoComArea('humanas', a4.token);
  await responderTudoComArea('exatas', a4.token);

  const r = await api.get(`/api/orientador/resumo?turma_id=${turmaId}`).set(auth(token));
  assert.equal(r.body.dados_ocultos, false);
  assert.equal(r.body.total_alunos, 4);
  assert.equal(r.body.alunos_com_teste, 4);
  assert.equal(r.body.taxa_participacao, 100);
  assert.equal(r.body.distribuicao[0].area, 'exatas');
  assert.equal(r.body.distribuicao[0].alunos, 3);
  assert.equal(r.body.distribuicao[0].percentual, 75);
  assert.equal(r.body.afinidade_media[0].area, 'exatas');
  assert.equal(r.body.sugestoes_acoes[0].area, 'exatas');
  assert.ok(r.body.carreiras_em_destaque.length > 0);
  assert.ok(!JSON.stringify(r.body).includes('@')); // nada individual no painel

  const escola = await api.get('/api/orientador/resumo').set(auth(token));
  assert.equal(escola.body.escopo.tipo, 'escola');
  assert.equal(escola.body.alunos_com_teste, 4);
});

test('orientador: cria turma, lista e não vê turmas de outra escola', opcoes, async () => {
  const { token } = await cadastrar({ nome: 'Prof. Sol', email: 'sol@escola.com', papel: 'orientador', codigo_escola: 'ORIENTADOR-DEMO' });

  const criada = await api.post('/api/orientador/turmas').set(auth(token)).send({ nome: '2º Ano B', ano_letivo: 2026 });
  assert.equal(criada.status, 201);
  assert.match(criada.body.codigo_acesso, /^T-[0-9A-F]{8}$/);

  const lista = await api.get('/api/orientador/turmas').set(auth(token));
  assert.ok(lista.body.turmas.some((t) => t.nome === '2º Ano B'));

  const { rows: [outra] } = await pool.query("INSERT INTO escolas (nome, codigo_orientador) VALUES ('Outra Escola', 'OUTRA-ESCOLA') RETURNING id");
  const { rows: [turmaAlheia] } = await pool.query("INSERT INTO turmas (escola_id, nome, ano_letivo, codigo_acesso) VALUES ($1, '3º C', 2026, 'T-ALHEIA') RETURNING id", [outra.id]);
  assert.equal((await api.get(`/api/orientador/resumo?turma_id=${turmaAlheia.id}`).set(auth(token))).status, 404);

  assert.equal((await api.post('/api/orientador/turmas').set(auth(token)).send({ nome: 'x', ano_letivo: 1 })).status, 400);
});

test('erros: rota inexistente e JSON inválido', opcoes, async () => {
  assert.equal((await api.get('/api/nada')).status, 404);
  const res = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{quebrado');
  assert.equal(res.status, 400);
});

test('vercel: index.js exporta o app Express e responde sem tocar no banco', opcoes, async () => {
  const appVercel = require('../index');
  assert.equal(typeof appVercel, 'function');
  const res = await request(appVercel).get('/api/rota-que-nao-existe');
  assert.equal(res.status, 404);
  assert.equal(res.body.erro, 'Rota não encontrada.');
});
