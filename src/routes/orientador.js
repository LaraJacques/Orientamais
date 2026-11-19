const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const config = require('../config');
const { AppError, naoEncontrado, validar, limparFiltros } = require('../errors');
const { autenticar, exigirPapel } = require('../middleware/auth');
const { DISCIPLINAS, MEDIA_APROVACAO, analisarAluno } = require('../services/analise');

// Ações sugeridas ao orientador conforme a área com mais alunos (objetivo: palestras, parcerias, eventos).
const ACOES_POR_AREA = {
  exatas: 'Convidar profissionais de tecnologia e engenharia para uma palestra e organizar visita a cursos técnicos ou superiores de computação.',
  saude: 'Promover uma roda de conversa com profissionais de saúde e uma parceria com escola técnica de enfermagem ou faculdade da região.',
  criativas: 'Organizar uma oficina de design/audiovisual e uma visita a agência, estúdio ou curso da área.',
  negocios: 'Realizar uma feira de empreendedorismo e convidar gestores e contadores para falar sobre a rotina profissional.',
  humanas: 'Organizar um debate com profissionais de direito, psicologia e educação e apresentar caminhos de graduação e concursos.',
};

const novaTurmaSchema = z.object({
  nome: z.string().trim().min(2).max(60),
  ano_letivo: z.number().int().min(2000).max(2100),
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const lancarNotasSchema = z.object({
  periodo: z.number().int().min(1).max(4),
  notas: z.array(z.object({
    disciplina: z.string().refine((d) => Object.hasOwn(DISCIPLINAS, d), 'Disciplina inválida'),
    nota: z.number().min(0).max(10),
  })).min(1).max(Object.keys(DISCIPLINAS).length)
    .refine((lista) => new Set(lista.map((n) => n.disciplina)).size === lista.length, 'Disciplina repetida na lista'),
});

const removerNotaSchema = z.object({
  disciplina: z.string().refine((d) => Object.hasOwn(DISCIPLINAS, d), 'Disciplina inválida'),
  periodo: z.coerce.number().int().min(1).max(4),
});

const resumoSchema = z.object({ turma_id: z.coerce.number().int().positive().optional() });

const arredondar = (n) => Math.round(n * 10) / 10;

module.exports = (pool) => {
  const router = express.Router();
  router.use(autenticar, exigirPapel('orientador'));

  // Garante que o orientador só enxergue turmas da própria escola.
  async function turmaDaEscola(turmaId, escolaId) {
    const { rows } = await pool.query('SELECT id, nome FROM turmas WHERE id = $1 AND escola_id = $2', [turmaId, escolaId]);
    if (!rows.length) throw naoEncontrado('Turma não encontrada.');
    return rows[0];
  }

  // Aluno da escola do orientador. Dados individuais (notas, respostas) só com autorização do aluno.
  async function alunoDaEscola(alunoId, escolaId, { exigirConsentimento = true } = {}) {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.turma_id, u.consentimento_orientador, u.consentimento_em, t.nome AS turma_nome
       FROM usuarios u LEFT JOIN turmas t ON t.id = u.turma_id
       WHERE u.id = $1 AND u.papel = 'aluno' AND u.escola_id = $2`,
      [alunoId, escolaId]
    );
    if (!rows.length) throw naoEncontrado('Aluno não encontrado.');
    if (exigirConsentimento && !rows[0].consentimento_orientador) {
      throw new AppError(403, 'Este aluno não autorizou o orientador a ver notas e respostas individuais.');
    }
    return rows[0];
  }

  async function notasDoAluno(alunoId) {
    const { rows } = await pool.query(
      'SELECT disciplina, periodo, nota FROM notas WHERE aluno_id = $1 ORDER BY disciplina, periodo', [alunoId]);
    return rows;
  }

  async function testeDoAluno(alunoId) {
    const { rows } = await pool.query(
      `SELECT t.id, t.criado_em, t.pontuacao, a.slug AS area_principal, a.nome AS area_principal_nome
       FROM tentativas t LEFT JOIN areas a ON a.id = t.area_principal_id
       WHERE t.usuario_id = $1 ORDER BY t.criado_em DESC, t.id DESC LIMIT 1`, [alunoId]);
    if (!rows.length) return null;
    const t = rows[0];
    const { rows: areas } = await pool.query('SELECT slug, nome FROM areas ORDER BY id');
    const total = Object.values(t.pontuacao).reduce((s, v) => s + v, 0);
    const ranking = areas
      .map((a) => ({ area: a.slug, nome: a.nome, pontos: t.pontuacao[a.slug] || 0,
        percentual: total ? arredondar(((t.pontuacao[a.slug] || 0) / total) * 100) : 0 }))
      .sort((x, y) => y.pontos - x.pontos);
    const { rows: respostas } = await pool.query(
      `SELECT p.ordem, p.texto AS pergunta, o.texto AS resposta, ar.slug AS area, ar.nome AS area_nome
       FROM respostas r
       JOIN perguntas p ON p.id = r.pergunta_id
       JOIN opcoes o ON o.id = r.opcao_id
       JOIN areas ar ON ar.id = o.area_id
       WHERE r.tentativa_id = $1 ORDER BY p.ordem`, [t.id]);
    return { realizado_em: t.criado_em, area_principal: t.area_principal, area_principal_nome: t.area_principal_nome, ranking, respostas };
  }

  // Agregados de notas. Só entram alunos que autorizaram. Disciplinas/faixas só aparecem com o mínimo de alunos.
  async function blocoNotas(escolaId, turmaId) {
    const escopo = `u.papel = 'aluno' AND u.consentimento_orientador AND u.escola_id = $1 AND ($2::int IS NULL OR u.turma_id = $2)`;
    const params = [escolaId, turmaId ?? null];
    const { rows: porDisc } = await pool.query(
      `SELECT n.disciplina, round(avg(n.nota), 1)::float AS media, count(DISTINCT n.aluno_id)::int AS alunos
       FROM notas n JOIN usuarios u ON u.id = n.aluno_id
       WHERE ${escopo} GROUP BY n.disciplina HAVING count(DISTINCT n.aluno_id) >= $3
       ORDER BY media DESC, n.disciplina`, [...params, config.minGrupoAgregado]);
    const { rows: medias } = await pool.query(
      `SELECT u.id, u.nome, round(avg(n.nota), 1)::float AS media_geral,
              count(DISTINCT n.disciplina) FILTER (WHERE d.media < ${MEDIA_APROVACAO})::int AS disciplinas_abaixo
       FROM usuarios u
       JOIN notas n ON n.aluno_id = u.id
       JOIN (SELECT aluno_id, disciplina, avg(nota) AS media FROM notas GROUP BY aluno_id, disciplina) d
         ON d.aluno_id = n.aluno_id AND d.disciplina = n.disciplina
       WHERE ${escopo} GROUP BY u.id, u.nome`, params);
    const base = { alunos_com_notas: medias.length };
    if (medias.length < config.minGrupoAgregado) {
      return { ...base, dados_ocultos: true, por_disciplina: [], faixas: [], alunos_atencao: [] };
    }
    const faixa = (min, max) => medias.filter((m) => m.media_geral >= min && m.media_geral < max).length;
    return {
      ...base,
      dados_ocultos: false,
      por_disciplina: porDisc,
      faixas: [
        { rotulo: `Abaixo de ${MEDIA_APROVACAO}`, alunos: faixa(0, MEDIA_APROVACAO) },
        { rotulo: `${MEDIA_APROVACAO} a 7,9`, alunos: faixa(MEDIA_APROVACAO, 8) },
        { rotulo: '8 ou mais', alunos: faixa(8, 10.1) },
      ],
      alunos_atencao: medias.filter((m) => m.media_geral < MEDIA_APROVACAO || m.disciplinas_abaixo >= 2)
        .sort((a, b) => a.media_geral - b.media_geral).slice(0, 10)
        .map((m) => ({ id: m.id, nome: m.nome, media_geral: m.media_geral, disciplinas_abaixo: m.disciplinas_abaixo })),
    };
  }

  router.get('/disciplinas', (_req, res) => {
    res.json({ disciplinas: Object.keys(DISCIPLINAS), periodos: [1, 2, 3, 4], media_aprovacao: MEDIA_APROVACAO });
  });

  router.get('/turmas', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT t.id, t.nome, t.ano_letivo, t.codigo_acesso,
              (SELECT count(*)::int FROM usuarios u WHERE u.turma_id = t.id AND u.papel = 'aluno') AS total_alunos,
              (SELECT count(*)::int FROM usuarios u WHERE u.turma_id = t.id AND u.papel = 'aluno' AND u.consentimento_orientador) AS alunos_com_autorizacao,
              (SELECT count(DISTINCT tt.usuario_id)::int FROM tentativas tt
                 JOIN usuarios u ON u.id = tt.usuario_id WHERE u.turma_id = t.id) AS alunos_com_teste
       FROM turmas t WHERE t.escola_id = $1
       ORDER BY t.ano_letivo DESC, t.nome`,
      [req.usuario.escolaId]
    );
    res.json({ turmas: rows });
  });

  router.post('/turmas', async (req, res) => {
    const dados = validar(novaTurmaSchema, req.body);
    const codigo = `T-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const { rows } = await pool.query(
      `INSERT INTO turmas (escola_id, nome, ano_letivo, codigo_acesso) VALUES ($1, $2, $3, $4)
       RETURNING id, nome, ano_letivo, codigo_acesso`,
      [req.usuario.escolaId, dados.nome, dados.ano_letivo, codigo]
    );
    res.status(201).json(rows[0]);
  });

  // Gera um código novo (o antigo deixa de valer para novos cadastros; quem já entrou continua na turma).
  router.post('/turmas/:id/novo-codigo', async (req, res) => {
    const { id } = validar(idSchema, req.params);
    await turmaDaEscola(id, req.usuario.escolaId);
    const codigo = `T-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const { rows } = await pool.query(
      'UPDATE turmas SET codigo_acesso = $1 WHERE id = $2 RETURNING id, nome, ano_letivo, codigo_acesso', [codigo, id]);
    res.json(rows[0]);
  });

  router.get('/turmas/:id/alunos', async (req, res) => {
    const { id } = validar(idSchema, req.params);
    const turma = await turmaDaEscola(id, req.usuario.escolaId);
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.consentimento_orientador AS autorizou,
              ult.area_principal,
              CASE WHEN u.consentimento_orientador THEN m.media_geral END AS media_geral,
              (ult.area_principal IS NOT NULL OR ult.tem_teste) AS fez_teste
       FROM usuarios u
       LEFT JOIN LATERAL (
         SELECT a.slug AS area_principal, TRUE AS tem_teste
         FROM tentativas t LEFT JOIN areas a ON a.id = t.area_principal_id
         WHERE t.usuario_id = u.id ORDER BY t.criado_em DESC, t.id DESC LIMIT 1
       ) ult ON TRUE
       LEFT JOIN (SELECT aluno_id, round(avg(nota), 1)::float AS media_geral FROM notas GROUP BY aluno_id) m ON m.aluno_id = u.id
       WHERE u.turma_id = $1 AND u.papel = 'aluno' ORDER BY u.nome`, [id]);
    res.json({
      turma,
      alunos: rows.map((r) => ({
        id: r.id, nome: r.nome, autorizou: r.autorizou, fez_teste: r.autorizou && Boolean(r.fez_teste),
        // sem autorização, o orientador vê só o nome: nada de teste, notas ou média
        area_principal: r.autorizou ? r.area_principal : null,
        media_geral: r.autorizou ? r.media_geral : null,
      })),
    });
  });

  // Ficha completa do aluno: teste (com respostas), notas e análise cruzada. Exige autorização do aluno.
  router.get('/alunos/:id', async (req, res) => {
    const { id } = validar(idSchema, req.params);
    const aluno = await alunoDaEscola(id, req.usuario.escolaId);
    const [teste, notas] = await Promise.all([testeDoAluno(id), notasDoAluno(id)]);
    const analise = analisarAluno({ notas, areaPrincipal: teste?.area_principal ?? null });
    res.json({
      aluno: { id: aluno.id, nome: aluno.nome, turma_id: aluno.turma_id, turma_nome: aluno.turma_nome, autorizacao_em: aluno.consentimento_em },
      teste, notas, analise,
    });
  });

  // Lança (ou corrige) as notas de um bimestre. Reenviar a mesma disciplina/bimestre atualiza a nota.
  router.put('/alunos/:id/notas', async (req, res) => {
    const { id } = validar(idSchema, req.params);
    const dados = validar(lancarNotasSchema, req.body);
    await alunoDaEscola(id, req.usuario.escolaId);
    await pool.query(
      `INSERT INTO notas (aluno_id, disciplina, periodo, nota, lancado_por)
       SELECT $1, d, $2, n, $3 FROM unnest($4::text[], $5::numeric[]) AS t(d, n)
       ON CONFLICT (aluno_id, disciplina, periodo)
       DO UPDATE SET nota = EXCLUDED.nota, lancado_por = EXCLUDED.lancado_por, atualizado_em = now()`,
      [id, dados.periodo, req.usuario.id, dados.notas.map((n) => n.disciplina), dados.notas.map((n) => Math.round(n.nota * 10) / 10)]
    );
    res.json({ salvas: dados.notas.length, notas: await notasDoAluno(id) });
  });

  router.delete('/alunos/:id/notas', async (req, res) => {
    const { id } = validar(idSchema, req.params);
    const { disciplina, periodo } = validar(removerNotaSchema, req.query);
    await alunoDaEscola(id, req.usuario.escolaId);
    const { rowCount } = await pool.query(
      'DELETE FROM notas WHERE aluno_id = $1 AND disciplina = $2 AND periodo = $3', [id, disciplina, periodo]);
    if (!rowCount) throw naoEncontrado('Nota não encontrada.');
    res.status(204).end();
  });

  // Visão consolidada da turma (ou de toda a escola, sem turma_id). Só dados agregados — nunca individuais.
  router.get('/resumo', async (req, res) => {
    const { turma_id: turmaId } = validar(resumoSchema, limparFiltros(req.query));
    const escolaId = req.usuario.escolaId;
    const turma = turmaId ? await turmaDaEscola(turmaId, escolaId) : null;

    const { rows: [contagem] } = await pool.query(
      `SELECT count(*)::int AS total FROM usuarios
       WHERE papel = 'aluno' AND escola_id = $1 AND ($2::int IS NULL OR turma_id = $2)`,
      [escolaId, turmaId ?? null]
    );

    // Considera apenas o teste mais recente de cada aluno.
    const { rows: ultimas } = await pool.query(
      `SELECT DISTINCT ON (t.usuario_id) a.slug AS area_principal, t.pontuacao
       FROM tentativas t
       JOIN usuarios u ON u.id = t.usuario_id
       LEFT JOIN areas a ON a.id = t.area_principal_id
       WHERE u.escola_id = $1 AND ($2::int IS NULL OR u.turma_id = $2)
       ORDER BY t.usuario_id, t.criado_em DESC, t.id DESC`,
      [escolaId, turmaId ?? null]
    );

    const comTeste = ultimas.length;
    const notas = await blocoNotas(escolaId, turmaId);
    const base = {
      escopo: turma ? { tipo: 'turma', turma } : { tipo: 'escola' },
      total_alunos: contagem.total,
      alunos_com_teste: comTeste,
      taxa_participacao: contagem.total ? arredondar((comTeste / contagem.total) * 100) : 0,
      minimo_para_exibir: config.minGrupoAgregado,
    };

    if (comTeste < config.minGrupoAgregado) {
      return res.json({
        ...base,
        dados_ocultos: true,
        mensagem: `Os resultados aparecem quando pelo menos ${config.minGrupoAgregado} alunos fizerem o teste, para proteger a privacidade dos estudantes.`,
        distribuicao: [], afinidade_media: [], carreiras_em_destaque: [], sugestoes_acoes: [], notas,
      });
    }

    const { rows: areas } = await pool.query('SELECT slug, nome FROM areas ORDER BY id');

    const alunosPorArea = Object.fromEntries(areas.map((a) => [a.slug, 0]));
    const somaPercentual = Object.fromEntries(areas.map((a) => [a.slug, 0]));
    for (const linha of ultimas) {
      if (linha.area_principal) alunosPorArea[linha.area_principal] += 1;
      const total = Object.values(linha.pontuacao).reduce((s, v) => s + v, 0);
      for (const a of areas) {
        somaPercentual[a.slug] += total > 0 ? ((linha.pontuacao[a.slug] || 0) / total) * 100 : 0;
      }
    }

    const distribuicao = areas
      .map((a) => ({
        area: a.slug, nome: a.nome, alunos: alunosPorArea[a.slug],
        percentual: arredondar((alunosPorArea[a.slug] / comTeste) * 100),
      }))
      .sort((x, y) => y.alunos - x.alunos || x.nome.localeCompare(y.nome, 'pt-BR'));

    const afinidadeMedia = areas.map((a) => ({
      area: a.slug, nome: a.nome, percentual_medio: arredondar(somaPercentual[a.slug] / comTeste),
    })).sort((x, y) => y.percentual_medio - x.percentual_medio);

    const areasEmAlta = distribuicao.filter((d) => d.alunos > 0).slice(0, 2);
    const { rows: carreiras } = await pool.query(
      `SELECT c.slug, c.nome, a.slug AS area
       FROM carreiras c JOIN areas a ON a.id = c.area_id
       WHERE a.slug = ANY($1) ORDER BY c.mercado_nivel DESC, c.nome LIMIT 6`,
      [areasEmAlta.map((d) => d.area)]
    );

    res.json({
      ...base,
      dados_ocultos: false,
      distribuicao,
      afinidade_media: afinidadeMedia,
      carreiras_em_destaque: carreiras,
      sugestoes_acoes: areasEmAlta.map((d) => ({ area: d.area, nome: d.nome, acao: ACOES_POR_AREA[d.area] })),
      notas,
    });
  });

  return router;
};
