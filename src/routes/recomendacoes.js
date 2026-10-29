const express = require('express');
const { z } = require('zod');
const { AppError, validar } = require('../errors');
const { autenticarOpcional } = require('../middleware/auth');
const { recomendarCursos } = require('../services/recomendacao');

const corpoSchema = z.object({
  // pontos (ou percentuais) por área. Se omitido, usa o último teste do aluno logado.
  pontuacao: z.record(z.string(), z.number().min(0)).optional(),
  uf: z.string().length(2).optional(),
  regiao: z.enum(['norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul']).optional(),
  orcamento_max: z.number().min(0).optional(),
  modalidade: z.enum(['presencial', 'ead', 'hibrido']).optional(),
  nivel: z.enum(['tecnico', 'superior']).optional(),
  limite: z.number().int().min(1).max(30).default(10),
});

module.exports = (pool) => {
  const router = express.Router();

  router.post('/', autenticarOpcional, async (req, res) => {
    const dados = validar(corpoSchema, req.body);

    const { rows: areas } = await pool.query('SELECT slug FROM areas');
    const slugsValidos = new Set(areas.map((a) => a.slug));

    let pontuacao = dados.pontuacao;
    let origem = 'informada';
    if (!pontuacao) {
      if (!req.usuario) {
        throw new AppError(400, 'Envie "pontuacao" ou faça login para usar o resultado do seu último teste.');
      }
      const { rows } = await pool.query(
        'SELECT pontuacao FROM tentativas WHERE usuario_id = $1 ORDER BY criado_em DESC, id DESC LIMIT 1',
        [req.usuario.id]
      );
      if (!rows.length) throw new AppError(404, 'Você ainda não fez o teste vocacional.');
      pontuacao = rows[0].pontuacao;
      origem = 'ultimo_teste';
    }

    const desconhecidas = Object.keys(pontuacao).filter((k) => !slugsValidos.has(k));
    if (desconhecidas.length) throw new AppError(400, `Áreas desconhecidas: ${desconhecidas.join(', ')}`);

    const { rows: cursos } = await pool.query(
      `SELECT c.id, c.nome, c.instituicao, c.cidade, c.uf, c.regiao, c.nivel, c.modalidade, c.rede,
              c.mensalidade, c.duracao_meses, c.ilustrativo,
              a.slug AS area, a.nome AS area_nome,
              ca.slug AS carreira, ca.nome AS carreira_nome, ca.mercado_nivel
       FROM cursos c
       JOIN areas a ON a.id = c.area_id
       LEFT JOIN carreiras ca ON ca.id = c.carreira_id
       WHERE ($1::text IS NULL OR c.modalidade = $1) AND ($2::text IS NULL OR c.nivel = $2)`,
      [dados.modalidade ?? null, dados.nivel ?? null]
    );

    const { total_candidatos, recomendacoes } = recomendarCursos(
      cursos,
      { pontuacao, uf: dados.uf, regiao: dados.regiao, orcamentoMax: dados.orcamento_max },
      dados.limite
    );

    res.json({
      origem_do_perfil: origem,
      total_candidatos,
      recomendacoes,
      dica: recomendacoes.length === 0
        ? 'Nenhum curso encaixou. Tente aumentar o orçamento, ampliar a região ou incluir cursos a distância (EAD).'
        : null,
    });
  });

  return router;
};
