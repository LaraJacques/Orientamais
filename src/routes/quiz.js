const express = require('express');
const { z } = require('zod');
const { AppError, validar } = require('../errors');
const { autenticar, autenticarOpcional, exigirPapel } = require('../middleware/auth');
const { calcularPontuacao, montarResultado } = require('../services/pontuacao');

// Modos do teste: rápido (6 perguntas), médio (15) e completo (20). São aninhados: a pergunta pertence
// ao modo quando sua "ordem" é menor ou igual ao limite. Sem "modo", vale o rápido (comportamento original).
const MODOS = { rapido: 6, medio: 15, completo: 20 };
const modoSchema = z.enum(['rapido', 'medio', 'completo']).default('rapido');

const respostasSchema = z.object({
  respostas: z.array(z.object({
    pergunta_id: z.number().int().positive(),
    opcao_id: z.number().int().positive(),
  })).min(1, 'Envie ao menos uma resposta'),
  modo: modoSchema,
});

module.exports = (pool) => {
  const router = express.Router();

  const carregarAreas = async () => (await pool.query('SELECT slug, nome FROM areas ORDER BY id')).rows;

  async function carreirasSugeridas(slugsAreas) {
    const { rows } = await pool.query(
      `SELECT c.slug, c.nome, a.slug AS area, c.salario_min, c.salario_max, c.mercado_nivel
       FROM carreiras c JOIN areas a ON a.id = c.area_id
       WHERE a.slug = ANY($1)
       ORDER BY c.mercado_nivel DESC, c.nome
       LIMIT 4`,
      [slugsAreas]
    );
    return rows;
  }

  // As opções NÃO expõem a área: a pontuação é calculada só no servidor.
  router.get('/perguntas', async (req, res) => {
    const modo = validar(z.object({ modo: modoSchema }), { modo: req.query.modo }).modo;
    const { rows } = await pool.query(
      `SELECT p.id AS pergunta_id, p.ordem, p.texto AS pergunta, o.id AS opcao_id, o.texto AS opcao
       FROM perguntas p JOIN opcoes o ON o.pergunta_id = p.id
       WHERE p.ordem <= $1
       ORDER BY p.ordem, o.id`,
      [MODOS[modo]]
    );
    const porPergunta = new Map();
    for (const r of rows) {
      if (!porPergunta.has(r.pergunta_id)) {
        porPergunta.set(r.pergunta_id, { id: r.pergunta_id, ordem: r.ordem, texto: r.pergunta, opcoes: [] });
      }
      porPergunta.get(r.pergunta_id).opcoes.push({ id: r.opcao_id, texto: r.opcao });
    }
    res.json({ modo, total: porPergunta.size, modos: MODOS, perguntas: [...porPergunta.values()] });
  });

  // Anônimo calcula o resultado; aluno logado também grava a tentativa (alimenta o painel do orientador).
  router.post('/respostas', autenticarOpcional, async (req, res) => {
    const { respostas, modo } = validar(respostasSchema, req.body);

    const perguntaIds = respostas.map((r) => r.pergunta_id);
    if (new Set(perguntaIds).size !== perguntaIds.length) {
      throw new AppError(400, 'Há mais de uma resposta para a mesma pergunta.');
    }

    const [{ rows: opcoes }, { rows: perguntas }, areas] = await Promise.all([
      pool.query(`SELECT o.id, o.pergunta_id, o.peso, a.slug AS area_slug
                  FROM opcoes o JOIN areas a ON a.id = o.area_id`),
      pool.query('SELECT id FROM perguntas WHERE ordem <= $1', [MODOS[modo]]),
      carregarAreas(),
    ]);
    const opcaoPorId = new Map(opcoes.map((o) => [o.id, o]));

    const escolhas = respostas.map((r) => {
      const opcao = opcaoPorId.get(r.opcao_id);
      if (!opcao || opcao.pergunta_id !== r.pergunta_id) {
        throw new AppError(400, `A opção ${r.opcao_id} não pertence à pergunta ${r.pergunta_id}.`);
      }
      return opcao;
    });

    // Perguntas fora do modo escolhido não são aceitas (o rápido não recebe respostas da pergunta 7, por exemplo).
    const idsDoModo = new Set(perguntas.map((p) => p.id));
    if (perguntaIds.some((id) => !idsDoModo.has(id))) {
      throw new AppError(400, 'Há respostas de perguntas que não fazem parte do modo escolhido.');
    }

    const respondidas = new Set(perguntaIds);
    const faltantes = perguntas.filter((p) => !respondidas.has(p.id)).map((p) => p.id);
    if (faltantes.length) {
      throw new AppError(400, 'Responda todas as perguntas para ver o resultado.', { perguntas_faltantes: faltantes });
    }

    const { pontos, ...resultado } = calcularPontuacao(escolhas, areas);

    let tentativaId = null;
    if (req.usuario && req.usuario.papel === 'aluno') {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const { rows } = await cliente.query(
          `INSERT INTO tentativas (usuario_id, area_principal_id, pontuacao)
           VALUES ($1, (SELECT id FROM areas WHERE slug = $2), $3) RETURNING id`,
          [req.usuario.id, resultado.area_principal, JSON.stringify(pontos)]
        );
        tentativaId = rows[0].id;
        for (const r of respostas) {
          await cliente.query(
            'INSERT INTO respostas (tentativa_id, pergunta_id, opcao_id) VALUES ($1, $2, $3)',
            [tentativaId, r.pergunta_id, r.opcao_id]
          );
        }
        await cliente.query('COMMIT');
      } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
      } finally {
        cliente.release();
      }
    }

    res.status(201).json({
      tentativa_id: tentativaId,
      salvo: tentativaId !== null,
      modo,
      pontuacao: pontos,
      ...resultado,
      carreiras_sugeridas: await carreirasSugeridas(resultado.areas_empatadas),
    });
  });

  // Último resultado do aluno logado (para o front reabrir o resultado sem refazer o teste).
  router.get('/resultado', autenticar, exigirPapel('aluno'), async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, criado_em, pontuacao FROM tentativas
       WHERE usuario_id = $1 ORDER BY criado_em DESC, id DESC LIMIT 1`,
      [req.usuario.id]
    );
    if (!rows.length) throw new AppError(404, 'Você ainda não fez o teste vocacional.');
    const areas = await carregarAreas();
    const resultado = montarResultado(rows[0].pontuacao, areas);
    res.json({
      tentativa_id: rows[0].id,
      realizado_em: rows[0].criado_em,
      pontuacao: rows[0].pontuacao,
      ...resultado,
      carreiras_sugeridas: await carreirasSugeridas(resultado.areas_empatadas),
    });
  });

  return router;
};
