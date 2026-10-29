const express = require('express');
const { z } = require('zod');
const { AppError, naoEncontrado, validar, limparFiltros } = require('../errors');

const ROTULO_DEMANDA = { 1: 'Muito baixa', 2: 'Baixa', 3: 'Moderada', 4: 'Alta', 5: 'Muito alta' };

const COLUNAS = `c.slug, c.nome, a.slug AS area, a.nome AS area_nome,
  c.rotina, c.salario_min, c.salario_max, c.mercado, c.mercado_nivel,
  c.formacao, c.duracao_anos, c.ilustrativo`;

const enriquecer = (c) => ({
  ...c,
  salario_medio: Math.round((c.salario_min + c.salario_max) / 2),
  demanda_rotulo: ROTULO_DEMANDA[c.mercado_nivel],
});

const listaSchema = z.object({
  area: z.string().max(30).optional(),
  q: z.string().max(80).optional(),
});

module.exports = (pool) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { area, q } = validar(listaSchema, limparFiltros(req.query));
    const { rows } = await pool.query(
      `SELECT ${COLUNAS}
       FROM carreiras c JOIN areas a ON a.id = c.area_id
       WHERE ($1::text IS NULL OR a.slug = $1)
         AND ($2::text IS NULL OR c.nome ILIKE '%' || $2 || '%')
       ORDER BY c.nome`,
      [area ?? null, q ?? null]
    );
    res.json({ total: rows.length, carreiras: rows.map(enriquecer) });
  });

  // Comparação lado a lado: /api/carreiras/comparar?slugs=eng-software,medicina,design
  // Precisa vir antes de "/:slug".
  router.get('/comparar', async (req, res) => {
    const slugs = String(req.query.slugs || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (slugs.length < 1 || slugs.length > 3) {
      throw new AppError(400, 'Informe de 1 a 3 carreiras em "slugs", separadas por vírgula.');
    }
    if (new Set(slugs).size !== slugs.length) throw new AppError(400, 'Carreiras repetidas na comparação.');

    const { rows } = await pool.query(
      `SELECT ${COLUNAS} FROM carreiras c JOIN areas a ON a.id = c.area_id WHERE c.slug = ANY($1)`,
      [slugs]
    );
    const encontrados = new Map(rows.map((r) => [r.slug, enriquecer(r)]));
    const ausentes = slugs.filter((s) => !encontrados.has(s));
    if (ausentes.length) throw naoEncontrado(`Carreira(s) não encontrada(s): ${ausentes.join(', ')}`);

    const carreiras = slugs.map((s) => encontrados.get(s)); // mantém a ordem pedida
    const melhor = (campo, maior = true) =>
      [...carreiras].sort((a, b) => (maior ? b[campo] - a[campo] : a[campo] - b[campo]))[0].slug;

    res.json({
      carreiras,
      destaques: carreiras.length > 1 ? {
        maior_salario_maximo: melhor('salario_max'),
        maior_salario_medio: melhor('salario_medio'),
        maior_demanda: melhor('mercado_nivel'),
        menor_duracao: melhor('duracao_anos', false),
      } : null,
    });
  });

  router.get('/:slug', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${COLUNAS} FROM carreiras c JOIN areas a ON a.id = c.area_id WHERE c.slug = $1`,
      [req.params.slug]
    );
    if (!rows.length) throw naoEncontrado('Carreira não encontrada.');
    res.json(enriquecer(rows[0]));
  });

  return router;
};
