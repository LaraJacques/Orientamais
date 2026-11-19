/* Orienta+ — login, conta do aluno e painel do orientador.
   Este arquivo é carregado ANTES do script principal do index.html; ele só declara funções e usa
   `state`, `api`, `go`, `render`, `esc`, `corArea` e `caixaErro` do script principal na hora de rodar. */

const CHAVE_SESSAO = 'orienta.sessao';
const NOMES_AREA = { exatas: 'Exatas & Tecnologia', saude: 'Saúde', criativas: 'Criativas', negocios: 'Negócios', humanas: 'Humanas' };

const painel = {
  carregado: false,
  escolaNome: '',
  turmas: [],
  disciplinas: [],
  mediaAprovacao: 6,
  turmaId: null,        // null = escola inteira
  aba: 'resumo',        // 'resumo' | 'alunos'
  resumo: null,
  alunos: null,
  alunoId: null,
  ficha: null,
  periodoNotas: 1,
  mostrarFormTurma: false,
  conta: null,
};

/* ---------- sessão ---------- */
function lerSessao() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO)); } catch { return null; }
}
function gravarSessao(s) {
  try { s ? sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)) : sessionStorage.removeItem(CHAVE_SESSAO); } catch { /* navegação privada */ }
}
function encerrarSessaoLocal() {
  state.sessao = null; gravarSessao(null);
  Object.assign(painel, { carregado: false, turmas: [], turmaId: null, aba: 'resumo', resumo: null, alunos: null, alunoId: null, ficha: null, conta: null });
}
const ehOrientador = () => state.sessao?.usuario?.papel === 'orientador';
const ehAluno = () => state.sessao?.usuario?.papel === 'aluno';

async function iniciarSessao() {
  const salva = lerSessao();
  if (!salva?.token) return;
  state.sessao = salva;
  try {
    const eu = await api('/auth/me');
    state.sessao.usuario = { ...state.sessao.usuario, ...eu };
    gravarSessao(state.sessao);
  } catch { encerrarSessaoLocal(); }
  render();
}

async function sair() {
  encerrarSessaoLocal();
  await go('home');
}

function itensExtraNav() {
  if (!state.sessao) return [{ id: 'login', label: 'Entrar' }];
  return [
    ehOrientador() ? { id: 'painel', label: 'Painel do orientador' } : { id: 'conta', label: 'Minha conta' },
    { id: '__sair', label: 'Sair', classe: 'nav-sair' },
  ];
}

function avisoSessao() {
  if (state.sessao) return '';
  return `<div class="aviso-sessao">Quer que seu resultado fique salvo e que o orientador da sua escola possa te ajudar?
    <a href="#" data-ir="cadastro">Crie uma conta</a> ou <a href="#" data-ir="login">entre</a> antes de fazer o teste.</div>`;
}

/* ---------- formatação ---------- */
const num1 = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const nomeArea = (slug) => NOMES_AREA[slug] || slug || '';
const classeNota = (n) => (n === null || n === undefined ? '' : n < painel.mediaAprovacao ? 'nota-baixa' : n >= 8 ? 'nota-alta' : '');

function barras(itens) {
  // itens: [{ rotulo, valor (0-100 para a largura), texto, cor }]
  return `<div class="bar-list">${itens.map((i) => `
    <div class="bar-row"><span>${esc(i.rotulo)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, i.valor))}%;background:${i.cor}"></div></div>
      <span class="bar-val">${esc(i.texto)}</span></div>`).join('')}</div>`;
}

/* ---------- telas: login e cadastro ---------- */
function viewLogin() {
  return `<section class="section-head"><h2>Entrar</h2><p>Alunos e orientadores entram aqui.</p></section>
  <form class="auth-card" data-form="login" novalidate>
    <div class="field"><label for="lEmail">E-mail</label><input id="lEmail" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="lSenha">Senha</label><input id="lSenha" name="senha" type="password" autocomplete="current-password" required></div>
    <button class="btn btn-primary" type="submit">Entrar</button>
    <p class="form-msg" role="alert" data-msg></p>
    <p class="auth-alt">Ainda não tem conta? <a href="#" data-ir="cadastro">Criar conta</a></p>
  </form>`;
}

function viewCadastro() {
  return `<section class="section-head"><h2>Criar conta</h2><p>Escolha como você vai usar o Orienta+.</p></section>
  <form class="auth-card" data-form="cadastro" novalidate>
    <div class="seg" role="radiogroup" aria-label="Tipo de conta">
      <label><input type="radio" name="papel" value="aluno" checked><span>Sou aluno(a)</span></label>
      <label><input type="radio" name="papel" value="orientador"><span>Sou orientador(a)</span></label>
    </div>
    <div class="field"><label for="cNome">Nome</label><input id="cNome" name="nome" type="text" autocomplete="name" required maxlength="120"></div>
    <div class="field"><label for="cEmail">E-mail</label><input id="cEmail" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="cSenha">Senha</label><input id="cSenha" name="senha" type="password" autocomplete="new-password" minlength="8" required>
      <div class="hint">Pelo menos 8 caracteres.</div></div>

    <div data-grupo="aluno">
      <div class="field"><label for="cTurma">Código da turma</label>
        <input id="cTurma" name="codigo_turma" type="text" autocomplete="off" placeholder="ex.: T-1A2B3C4D" maxlength="40">
        <div class="hint">Quem passa o código é o orientador da sua escola. Sem código você usa o Orienta+ normalmente, mas ninguém da escola vê seus dados.</div></div>
      <label class="consent"><input type="checkbox" name="consentimento_orientador">
        <span>Autorizo o orientador da minha escola a ver minhas notas e minhas respostas do teste vocacional, para me ajudar na orientação.
        Tenho 18 anos ou mais, ou meu responsável legal concordou. Posso retirar a autorização quando quiser em “Minha conta”.</span></label>
    </div>

    <div data-grupo="orientador" class="hidden">
      <div class="field"><label for="cEscola">Código da escola</label>
        <input id="cEscola" name="codigo_escola" type="text" autocomplete="off" maxlength="40">
        <div class="hint">Fornecido pela coordenação do Orienta+ para a sua escola.</div></div>
    </div>

    <button class="btn btn-primary" type="submit">Criar conta</button>
    <p class="form-msg" role="alert" data-msg></p>
    <p class="auth-alt">Já tem conta? <a href="#" data-ir="login">Entrar</a></p>
  </form>`;
}

/* ---------- tela: conta do aluno ---------- */
function viewConta() {
  if (!ehAluno()) return viewLogin();
  const c = painel.conta;
  if (!c) return `<section class="section-head"><h2>Minha conta</h2></section>` + (state.erro ? caixaErro() : caixaCarregando());
  const emTurma = Boolean(c.turma_id);
  return `<section class="section-head"><h2>Olá, ${esc(c.nome.split(' ')[0])}!</h2>
    <p>${emTurma ? `Você está na turma <b>${esc(c.turma_nome)}</b>${c.escola_nome ? ` · ${esc(c.escola_nome)}` : ''}.` : 'Você ainda não entrou em uma turma, então ninguém da escola vê seus dados.'}</p></section>
  <div class="painel-bloco">
    <h3>Seu teste vocacional</h3>
    <p class="sub">Os testes que você faz logado ficam salvos na sua conta.</p>
    <button class="btn btn-primary" data-ir="quiz">Fazer o teste</button>
  </div>
  ${emTurma ? `<div class="painel-bloco">
    <h3>Privacidade</h3>
    <p class="sub">Você decide se o orientador da escola pode ver suas notas e suas respostas do teste.</p>
    <label class="consent"><input type="checkbox" data-consent ${c.consentimento_orientador ? 'checked' : ''}>
      <span>Autorizo o orientador da minha escola a ver minhas notas e minhas respostas do teste vocacional.</span></label>
    <p class="form-msg" role="status" data-msg></p>
  </div>` : ''}`;
}

/* ---------- tela: painel do orientador ---------- */
function viewPainel() {
  if (!ehOrientador()) return viewLogin();
  const cab = `<section class="section-head painel-top"><div><h2>Painel do orientador</h2>
    <p>${esc(painel.escolaNome || '')}</p></div></section>`;
  if (state.erro) return cab + caixaErro();
  if (!painel.carregado) return cab + caixaCarregando();
  if (painel.alunoId) return cab + viewFicha();

  const t = painel.turmas.find((x) => x.id === painel.turmaId) || null;
  const chips = `<div class="chip-row" role="group" aria-label="Turmas">
    <button class="chip ${painel.turmaId === null ? 'selected' : ''}" data-turma="">Toda a escola</button>
    ${painel.turmas.map((x) => `<button class="chip ${x.id === painel.turmaId ? 'selected' : ''}" data-turma="${x.id}">${esc(x.nome)} · ${x.ano_letivo}</button>`).join('')}
    <button class="chip" data-nova-turma>+ Nova turma</button></div>`;

  const formTurma = painel.mostrarFormTurma ? `<form class="inline-form" data-form="turma" novalidate>
    <div class="field"><label for="tNome">Nome da turma</label><input id="tNome" name="nome" type="text" placeholder="ex.: 3º Ano A" required maxlength="60"></div>
    <div class="field"><label for="tAno">Ano letivo</label><input id="tAno" name="ano_letivo" type="number" min="2000" max="2100" value="${new Date().getFullYear()}" required></div>
    <button class="btn btn-primary btn-sm" type="submit">Criar turma e gerar código</button>
    <p class="form-msg" role="alert" data-msg style="flex-basis:100%;margin:0"></p></form>` : '';

  const vazio = !painel.turmas.length && !painel.mostrarFormTurma
    ? `<div class="status-box">Você ainda não tem turmas. Crie a primeira para gerar o código que os alunos usam para entrar.<br>
       <button class="btn btn-primary" data-nova-turma>Criar turma</button></div>` : '';

  const codigo = t ? `<div class="code-card"><p>Código de acesso da turma <b>${esc(t.nome)}</b></p>
      <span class="code-val">${esc(t.codigo_acesso)}</span>
      <button class="btn btn-ghost btn-sm" data-copiar="${esc(t.codigo_acesso)}">Copiar</button>
      <button class="btn btn-ghost btn-sm" data-novo-codigo>Gerar novo código</button>
      <p style="margin:10px 0 0;font-size:0.84rem">Passe o código para os alunos. Eles informam em <b>Entrar → Criar conta</b>. Quem já entrou continua na turma se você gerar um código novo.</p>
      <p class="form-msg" role="status" data-msg-codigo></p></div>
    <div class="stat-row">
      <div class="stat"><b>${t.total_alunos}</b><span>alunos na turma</span></div>
      <div class="stat"><b>${t.alunos_com_autorizacao}</b><span>autorizaram o orientador a ver os dados</span></div>
      <div class="stat"><b>${t.alunos_com_teste}</b><span>fizeram o teste vocacional</span></div></div>` : '';

  const abas = t ? `<div class="tabs" role="tablist">
    <button role="tab" class="${painel.aba === 'resumo' ? 'active' : ''}" data-aba="resumo">Visão da turma</button>
    <button role="tab" class="${painel.aba === 'alunos' ? 'active' : ''}" data-aba="alunos">Alunos</button></div>` : '';

  const corpo = !painel.turmas.length && painel.turmaId === null && !painel.resumo ? ''
    : (t && painel.aba === 'alunos') ? tabelaAlunos() : blocoResumo();

  return cab + chips + formTurma + vazio + codigo + abas + corpo;
}

function blocoResumo() {
  const r = painel.resumo;
  if (!r) return caixaCarregando();
  const partes = [];
  if (r.dados_ocultos) {
    partes.push(`<div class="painel-bloco"><h3>Interesses do questionário</h3><p class="sub" style="margin:0">${esc(r.mensagem)}</p></div>`);
  } else {
    partes.push(`<div class="painel-bloco"><h3>Interesses do questionário</h3>
      <p class="sub">${r.alunos_com_teste} de ${r.total_alunos} alunos fizeram o teste (${num1(r.taxa_participacao)}%). Área com mais afinidade de cada aluno:</p>
      ${barras(r.distribuicao.map((d) => ({ rotulo: d.nome, valor: d.percentual, texto: `${d.alunos} (${Math.round(d.percentual)}%)`, cor: corArea(d.area) })))}</div>`);
    partes.push(`<div class="two-col">
      <div class="painel-bloco"><h3>Sugestões de ação</h3><ul class="lista-simples">
        ${r.sugestoes_acoes.map((s) => `<li><b>${esc(s.nome)}:</b> ${esc(s.acao)}</li>`).join('')}</ul></div>
      <div class="painel-bloco"><h3>Carreiras para apresentar</h3><div class="course-tags" style="margin-top:10px">
        ${r.carreiras_em_destaque.map((c) => `<span class="tag">${esc(c.nome)}</span>`).join('')}</div></div></div>`);
  }
  partes.push(blocoNotasTurma(r.notas));
  return partes.join('');
}

function blocoNotasTurma(n) {
  if (!n || n.dados_ocultos) {
    return `<div class="painel-bloco"><h3>Notas da turma</h3><p class="sub" style="margin:0">As notas aparecem aqui quando pelo menos 3 alunos que autorizaram tiverem notas lançadas (para não identificar alunos individualmente nos agregados). Hoje: ${n ? n.alunos_com_notas : 0}.</p></div>`;
  }
  const atencao = n.alunos_atencao.length
    ? `<ul class="lista-simples">${n.alunos_atencao.map((a) => `<li><button class="link-btn" data-aluno="${a.id}">${esc(a.nome)}</button> — média ${num1(a.media_geral)}${a.disciplinas_abaixo ? `, ${a.disciplinas_abaixo} disciplina(s) abaixo de ${painel.mediaAprovacao}` : ''}</li>`).join('')}</ul>`
    : '<p class="sub" style="margin:8px 0 0">Nenhum aluno com média abaixo de ' + painel.mediaAprovacao + '.</p>';
  return `<div class="painel-bloco"><h3>Notas da turma</h3>
      <p class="sub">Média por disciplina, considerando ${n.alunos_com_notas} alunos com notas lançadas.</p>
      ${barras(n.por_disciplina.map((d) => ({ rotulo: d.disciplina, valor: d.media * 10, texto: num1(d.media), cor: d.media < painel.mediaAprovacao ? 'var(--rose)' : 'var(--teal)' })))}
    </div>
    <div class="two-col">
      <div class="painel-bloco"><h3>Distribuição das médias</h3>
        ${barras(n.faixas.map((f, i) => ({ rotulo: f.rotulo, valor: n.alunos_com_notas ? (f.alunos / n.alunos_com_notas) * 100 : 0, texto: String(f.alunos), cor: ['var(--rose)', 'var(--amber)', 'var(--teal)'][i] })))}</div>
      <div class="painel-bloco"><h3>Alunos que pedem atenção</h3>${atencao}</div></div>`;
}

function tabelaAlunos() {
  if (!painel.alunos) return caixaCarregando();
  if (!painel.alunos.length) return '<div class="status-box">Nenhum aluno entrou nesta turma ainda. Passe o código acima para a turma.</div>';
  return `<table class="tbl"><thead><tr><th>Aluno</th><th>Autorização</th><th>Área do teste</th><th class="num">Média</th><th></th></tr></thead><tbody>
    ${painel.alunos.map((a) => a.autorizou ? `<tr><td>${esc(a.nome)}</td><td><span class="badge ok">Autorizou</span></td>
        <td>${a.area_principal ? `<span class="area-tag" style="background:${corArea(a.area_principal)};margin:0">${esc(nomeArea(a.area_principal))}</span>` : '<span class="badge">Sem teste</span>'}</td>
        <td class="num ${classeNota(a.media_geral)}">${num1(a.media_geral)}</td>
        <td><button class="btn btn-ghost btn-sm" data-aluno="${a.id}">Abrir ficha</button></td></tr>`
      : `<tr class="mudo"><td>${esc(a.nome)}</td><td><span class="badge">Sem autorização</span></td><td colspan="3">O aluno não autorizou ver notas e respostas.</td></tr>`).join('')}
    </tbody></table>`;
}

function viewFicha() {
  const f = painel.ficha;
  const voltar = `<a href="#" class="voltar" data-voltar-lista>← Voltar para a turma</a>`;
  if (!f) return voltar + caixaCarregando();
  const { aluno, teste, notas, analise } = f;
  const rotuloAlinh = { alinhado: ['ok', 'Perfil e notas alinhados'], divergente: ['alerta', 'Interesse e notas divergem'], neutro: ['', 'Desempenho na média'], sem_dados: ['', 'Dados incompletos'] }[analise.alinhamento];

  const leitura = `<div class="painel-bloco"><h3>Leitura para a orientação <span class="badge ${rotuloAlinh[0]}" style="margin-left:8px">${rotuloAlinh[1]}</span></h3>
    <ul class="obs-list">${analise.observacoes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
    <p class="aviso-leve">Cruzamento automático entre notas e questionário, feito com regras simples. É um apoio para a conversa, não um diagnóstico.</p></div>`;

  const blocoTeste = !teste
    ? `<div class="painel-bloco"><h3>Questionário vocacional</h3><p class="sub" style="margin:0">O aluno ainda não fez o teste.</p></div>`
    : `<div class="painel-bloco"><h3>Questionário vocacional</h3>
      <p class="sub">Feito em ${dataBR(teste.realizado_em)}. Área com mais afinidade: <b>${esc(teste.area_principal_nome || '–')}</b>.</p>
      ${barras(teste.ranking.map((x) => ({ rotulo: x.nome, valor: x.percentual, texto: `${Math.round(x.percentual)}%`, cor: corArea(x.area) })))}
      <table class="tbl" style="margin-top:18px"><thead><tr><th>Pergunta</th><th>O que o aluno escolheu</th><th>Área</th></tr></thead><tbody>
      ${teste.respostas.map((r) => `<tr><td>${esc(r.pergunta)}</td><td>${esc(r.resposta)}</td><td><span class="area-tag" style="background:${corArea(r.area)};margin:0">${esc(r.area_nome)}</span></td></tr>`).join('')}
      </tbody></table></div>`;

  const porDisc = analise.por_disciplina;
  const tabNotas = porDisc.length ? `<table class="tbl"><thead><tr><th>Disciplina</th>
      ${[1, 2, 3, 4].map((p) => `<th class="num">${p}º bim.</th>`).join('')}<th class="num">Média</th><th class="num">Variação</th></tr></thead><tbody>
      ${porDisc.map((d) => `<tr><td>${esc(d.disciplina)}</td>
        ${[1, 2, 3, 4].map((p) => { const b = d.bimestres.find((x) => x.periodo === p);
          return `<td class="num ${b ? classeNota(b.nota) : ''}">${b ? num1(b.nota) + `<button class="x-nota" title="Remover esta nota" aria-label="Remover nota de ${esc(d.disciplina)} do ${p}º bimestre" data-del-nota data-disc="${esc(d.disciplina)}" data-per="${p}">×</button>` : '–'}</td>`; }).join('')}
        <td class="num ${classeNota(d.media)}"><b>${num1(d.media)}</b></td>
        <td class="num ${d.variacao < 0 ? 'nota-baixa' : d.variacao > 0 ? 'nota-alta' : ''}">${d.variacao === null ? '–' : (d.variacao > 0 ? '+' : '') + num1(d.variacao)}</td></tr>`).join('')}
      </tbody></table>
      <p class="aviso-leve">Média geral: <b>${num1(analise.media_geral)}</b></p>` : '<p class="sub" style="margin:0">Ainda não há notas lançadas.</p>';

  const porArea = analise.por_area.length ? `<h3 style="margin-top:22px;font-size:1rem">Desempenho por área do teste</h3>
    <p class="sub">Média das disciplinas ligadas a cada área (regra simples, só para comparar com o questionário).</p>
    ${barras(analise.por_area.map((a) => ({ rotulo: a.nome, valor: a.media * 10, texto: num1(a.media), cor: corArea(a.area) })))}` : '';

  const atuais = Object.fromEntries(notas.filter((n) => n.periodo === painel.periodoNotas).map((n) => [n.disciplina, n.nota]));
  const form = `<form data-form="notas" novalidate><div class="inline-form" style="margin-top:0">
      <div class="field"><label for="nBim">Bimestre</label><select id="nBim" name="periodo">
        ${[1, 2, 3, 4].map((p) => `<option value="${p}" ${p === painel.periodoNotas ? 'selected' : ''}>${p}º bimestre</option>`).join('')}</select></div>
      <p class="aviso-leve" style="margin:0;flex:1;min-width:200px">Preencha só as disciplinas que quiser lançar ou corrigir (de 0 a 10). Campos vazios são ignorados.</p></div>
    <div class="grade-form">${painel.disciplinas.map((d, i) => `<div class="field"><label for="n${i}">${esc(d)}</label>
      <input id="n${i}" type="number" inputmode="decimal" min="0" max="10" step="0.1" data-disc="${esc(d)}" value="${atuais[d] ?? ''}"></div>`).join('')}</div>
    <button class="btn btn-primary" type="submit">Salvar notas do bimestre</button>
    <p class="form-msg" role="alert" data-msg></p></form>`;

  return `${voltar}
    <section class="section-head" style="padding-top:14px"><h2>${esc(aluno.nome)}</h2>
      <p>${esc(aluno.turma_nome || '')} · autorizou em ${dataBR(aluno.autorizacao_em)}</p></section>
    ${leitura}${blocoTeste}
    <div class="painel-bloco"><h3>Notas</h3>${tabNotas}${porArea}</div>
    <div class="painel-bloco"><h3>Lançar notas</h3>${form}</div>`;
}

/* ---------- carregamento ---------- */
async function carregarExtra(view) {
  if (view === 'painel') {
    if (!ehOrientador()) { state.view = 'login'; return; }
    if (!painel.carregado) {
      const [eu, turmas, disc] = await Promise.all([api('/auth/me'), api('/orientador/turmas'), api('/orientador/disciplinas')]);
      painel.escolaNome = eu.escola_nome || '';
      painel.turmas = turmas.turmas;
      painel.disciplinas = disc.disciplinas;
      painel.mediaAprovacao = disc.media_aprovacao;
      painel.carregado = true;
    }
    await carregarVisao();
  }
  if (view === 'conta' && ehAluno()) painel.conta = await api('/auth/me');
  if ((view === 'conta' || view === 'painel') && !state.sessao) state.view = 'login';
}

async function carregarVisao() {
  await carregarAreas();
  const q = painel.turmaId ? `?turma_id=${painel.turmaId}` : '';
  painel.resumo = await api('/orientador/resumo' + q);
  painel.alunos = null;
  if (painel.turmaId && painel.aba === 'alunos') painel.alunos = (await api(`/orientador/turmas/${painel.turmaId}/alunos`)).alunos;
}

async function atualizarTurmas() {
  painel.turmas = (await api('/orientador/turmas')).turmas;
}

async function acao(fn) {
  state.erro = null;
  try { await fn(); } catch (e) { state.erro = e.message; }
  render();
}

async function abrirFicha(id) {
  painel.alunoId = id; painel.ficha = null; render();
  await acao(async () => { painel.ficha = await api(`/orientador/alunos/${id}`); });
}

/* ---------- handlers ---------- */
function mostrarMsg(el, texto, tipo = 'erro') {
  if (!el) return;
  el.textContent = texto; el.className = 'form-msg ' + tipo;
}

function attachExtra() {
  const $$ = (s) => document.querySelectorAll(s);

  $$('[data-ir]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.ir); }));

  // login
  $$('form[data-form="login"]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('[data-msg]');
    const corpo = { email: form.email.value.trim(), senha: form.senha.value };
    if (!corpo.email || !corpo.senha) return mostrarMsg(msg, 'Preencha e-mail e senha.');
    mostrarMsg(msg, 'Entrando...', 'ok');
    try {
      const r = await api('/auth/login', { metodo: 'POST', corpo });
      state.sessao = { token: r.token, usuario: r.usuario }; gravarSessao(state.sessao);
      go(r.usuario.papel === 'orientador' ? 'painel' : 'conta');
    } catch (err) { mostrarMsg(msg, err.message); }
  }));

  // cadastro
  $$('form[data-form="cadastro"]').forEach((form) => {
    const alternar = () => {
      const papel = form.papel.value;
      form.querySelector('[data-grupo="aluno"]').classList.toggle('hidden', papel !== 'aluno');
      form.querySelector('[data-grupo="orientador"]').classList.toggle('hidden', papel !== 'orientador');
    };
    form.querySelectorAll('input[name="papel"]').forEach((r) => r.addEventListener('change', alternar));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = form.querySelector('[data-msg]');
      const papel = form.papel.value;
      const corpo = { nome: form.nome.value.trim(), email: form.email.value.trim(), senha: form.senha.value, papel };
      if (!corpo.nome || !corpo.email) return mostrarMsg(msg, 'Preencha nome e e-mail.');
      if (corpo.senha.length < 8) return mostrarMsg(msg, 'A senha precisa ter pelo menos 8 caracteres.');
      if (papel === 'aluno') {
        const turma = form.codigo_turma.value.trim();
        if (turma) corpo.codigo_turma = turma;
        corpo.consentimento_orientador = Boolean(turma) && form.consentimento_orientador.checked;
      } else {
        corpo.codigo_escola = form.codigo_escola.value.trim();
        if (!corpo.codigo_escola) return mostrarMsg(msg, 'Informe o código da escola.');
      }
      mostrarMsg(msg, 'Criando conta...', 'ok');
      try {
        const r = await api('/auth/registro', { metodo: 'POST', corpo });
        state.sessao = { token: r.token, usuario: r.usuario }; gravarSessao(state.sessao);
        go(papel === 'orientador' ? 'painel' : 'conta');
      } catch (err) { mostrarMsg(msg, err.message); }
    });
  });

  // conta do aluno: autorização
  $$('[data-consent]').forEach((cb) => cb.addEventListener('change', async () => {
    const msg = document.querySelector('[data-msg]');
    try {
      const r = await api('/auth/consentimento', { metodo: 'PATCH', corpo: { consentimento_orientador: cb.checked } });
      painel.conta.consentimento_orientador = r.consentimento_orientador;
      state.sessao.usuario.consentimento_orientador = r.consentimento_orientador; gravarSessao(state.sessao);
      mostrarMsg(msg, r.consentimento_orientador ? 'Autorização registrada.' : 'Autorização retirada. O orientador não vê mais seus dados.', 'ok');
    } catch (err) { cb.checked = !cb.checked; mostrarMsg(msg, err.message); }
  }));

  // painel: turmas
  $$('[data-turma]').forEach((b) => b.addEventListener('click', () => acao(async () => {
    painel.turmaId = b.dataset.turma ? Number(b.dataset.turma) : null;
    painel.aba = 'resumo'; painel.resumo = null; painel.mostrarFormTurma = false;
    render(); await carregarVisao();
  })));
  $$('[data-nova-turma]').forEach((b) => b.addEventListener('click', () => { painel.mostrarFormTurma = !painel.mostrarFormTurma; render(); }));
  $$('form[data-form="turma"]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = form.querySelector('[data-msg]');
    const nome = form.nome.value.trim(); const ano = Number(form.ano_letivo.value);
    if (nome.length < 2) return mostrarMsg(msg, 'Informe o nome da turma.');
    try {
      const nova = await api('/orientador/turmas', { metodo: 'POST', corpo: { nome, ano_letivo: ano } });
      await atualizarTurmas();
      painel.mostrarFormTurma = false; painel.turmaId = nova.id; painel.aba = 'resumo'; painel.resumo = null;
      render(); await acao(carregarVisao);
    } catch (err) { mostrarMsg(msg, err.message); }
  }));
  $$('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
    const msg = document.querySelector('[data-msg-codigo]');
    try { await navigator.clipboard.writeText(b.dataset.copiar); mostrarMsg(msg, 'Código copiado.', 'ok'); }
    catch { mostrarMsg(msg, 'Não consegui copiar automaticamente. Selecione o código e copie.', 'erro'); }
  }));
  $$('[data-novo-codigo]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Gerar um novo código? O código atual deixa de funcionar para novos cadastros (quem já entrou continua na turma).')) return;
    acao(async () => {
      await api(`/orientador/turmas/${painel.turmaId}/novo-codigo`, { metodo: 'POST' });
      await atualizarTurmas();
    });
  }));
  $$('[data-aba]').forEach((b) => b.addEventListener('click', () => acao(async () => {
    painel.aba = b.dataset.aba; painel.alunos = null; render(); await carregarVisao();
  })));

  // ficha do aluno
  $$('[data-aluno]').forEach((b) => b.addEventListener('click', () => abrirFicha(Number(b.dataset.aluno))));
  $$('[data-voltar-lista]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); painel.alunoId = null; painel.ficha = null; acao(async () => { await atualizarTurmas(); await carregarVisao(); });
  }));
  $$('form[data-form="notas"]').forEach((form) => {
    form.periodo.addEventListener('change', () => { painel.periodoNotas = Number(form.periodo.value); render(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = form.querySelector('[data-msg]');
      const notas = [...form.querySelectorAll('input[data-disc]')]
        .filter((i) => i.value !== '')
        .map((i) => ({ disciplina: i.dataset.disc, nota: Number(i.value.replace(',', '.')) }));
      if (!notas.length) return mostrarMsg(msg, 'Preencha pelo menos uma nota.');
      if (notas.some((n) => Number.isNaN(n.nota) || n.nota < 0 || n.nota > 10)) return mostrarMsg(msg, 'As notas devem estar entre 0 e 10.');
      try {
        await api(`/orientador/alunos/${painel.alunoId}/notas`, { metodo: 'PUT', corpo: { periodo: Number(form.periodo.value), notas } });
        painel.periodoNotas = Number(form.periodo.value);
        painel.ficha = await api(`/orientador/alunos/${painel.alunoId}`);
        render();
        mostrarMsg(document.querySelector('form[data-form="notas"] [data-msg]'), `${notas.length} nota(s) salva(s).`, 'ok');
      } catch (err) { mostrarMsg(msg, err.message); }
    });
  });
  $$('[data-del-nota]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm(`Remover a nota de ${b.dataset.disc} do ${b.dataset.per}º bimestre?`)) return;
    acao(async () => {
      await api(`/orientador/alunos/${painel.alunoId}/notas?disciplina=${encodeURIComponent(b.dataset.disc)}&periodo=${b.dataset.per}`, { metodo: 'DELETE' });
      painel.ficha = await api(`/orientador/alunos/${painel.alunoId}`);
    });
  }));
}

window.VIEWS_EXTRA = { login: viewLogin, cadastro: viewCadastro, conta: viewConta, painel: viewPainel };
