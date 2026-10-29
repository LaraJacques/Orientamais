const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const config = require('../config');
const { AppError, naoEncontrado, validar, limparFiltros } = require('../errors');
const { autenticar, exigirPapel } = require('../middleware/auth');

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

  router.get('/turmas', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT t.id, t.nome, t.ano_letivo, t.codigo_acesso,
              (SELECT count(*)::int FROM usuarios u WHERE u.turma_id = t.id AND u.papel = 'aluno') AS total_alunos,
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
        distribuicao: [], afinidade_media: [], carreiras_em_destaque: [], sugestoes_acoes: [],
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
    });
  });

  return router;
};
