const express = require('express');
const { z } = require('zod');
const { validar, limparFiltros } = require('../errors');

const REGIOES = ['norte', 'nordeste', 'centro-oeste', 'sudeste', 'sul'];

const filtrosSchema = z.object({
  regiao: z.enum(REGIOES).optional(),
  uf: z.string().length(2).optional(),
  area: z.string().max(30).optional(),
  nivel: z.enum(['tecnico', 'superior']).optional(),
  modalidade: z.enum(['presencial', 'ead', 'hibrido']).optional(),
  rede: z.enum(['publica', 'privada']).optional(),
  orcamento_max: z.coerce.number().min(0).optional(),
  gratuito: z.enum(['true', 'false']).optional(),
  incluir_ead: z.enum(['true', 'false']).default('true'), // curso EAD vale para qualquer região
  q: z.string().max(80).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  pagina: z.coerce.number().int().min(1).default(1),
});

module.exports = (pool) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const f = validar(filtrosSchema, limparFiltros(req.query));
    const incluirEad = f.incluir_ead === 'true';

    const { rows } = await pool.query(
      `SELECT c.id, c.nome, c.instituicao, c.cidade, c.uf, c.regiao, c.nivel, c.modalidade, c.rede,
              c.mensalidade, c.duracao_meses, c.ilustrativo,
              a.slug AS area, a.nome AS area_nome, ca.slug AS carreira, ca.nome AS carreira_nome,
              count(*) OVER()::int AS total
       FROM cursos c
       JOIN areas a ON a.id = c.area_id
       LEFT JOIN carreiras ca ON ca.id = c.carreira_id
       WHERE ($1::text IS NULL OR c.regiao = $1 OR ($7 AND c.modalidade = 'ead'))
         AND ($2::text IS NULL OR c.uf = upper($2) OR ($7 AND c.modalidade = 'ead'))
         AND ($3::text IS NULL OR a.slug = $3)
         AND ($4::text IS NULL OR c.nivel = $4)
         AND ($5::text IS NULL OR c.modalidade = $5)
         AND ($6::numeric IS NULL OR c.mensalidade <= $6)
         AND ($8::text IS NULL OR c.rede = $8)
         AND ($9::boolean IS NULL OR (c.mensalidade = 0) = $9)
         AND ($10::text IS NULL OR c.nome ILIKE '%' || $10 || '%' OR c.instituicao ILIKE '%' || $10 || '%')
       ORDER BY c.mensalidade, c.nome
       LIMIT $11 OFFSET $12`,
      [
        f.regiao ?? null, f.uf ?? null, f.area ?? null, f.nivel ?? null, f.modalidade ?? null,
        f.orcamento_max ?? null, incluirEad, f.rede ?? null,
        f.gratuito === undefined ? null : f.gratuito === 'true',
        f.q ?? null, f.limite, (f.pagina - 1) * f.limite,
      ]
    );

    res.json({
      total: rows.length ? rows[0].total : 0,
      pagina: f.pagina,
      limite: f.limite,
      cursos: rows.map(({ total, ...curso }) => curso),
    });
  });

  return router;
};
