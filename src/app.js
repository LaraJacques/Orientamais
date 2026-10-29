const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ZodError } = require('zod');
const config = require('./config');
const { AppError } = require('./errors');

function criarApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  if (config.emProducao) app.set('trust proxy', 1); // atrás do proxy do Render/Railway

  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim()),
  }));
  app.use(express.json({ limit: '50kb' }));

  const limitadorAuth = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.limiteAuth,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
  });

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  app.get('/api/areas', async (_req, res) => {
    const { rows } = await pool.query('SELECT slug, nome FROM areas ORDER BY id');
    res.json({ areas: rows });
  });

  app.use('/api/auth', limitadorAuth, require('./routes/auth')(pool));
  app.use('/api/quiz', require('./routes/quiz')(pool));
  app.use('/api/carreiras', require('./routes/carreiras')(pool));
  app.use('/api/cursos', require('./routes/cursos')(pool));
  app.use('/api/recomendacoes', require('./routes/recomendacoes')(pool));
  app.use('/api/orientador', require('./routes/orientador')(pool));

  app.use((_req, _res, next) => next(new AppError(404, 'Rota não encontrada.')));

  // eslint-disable-next-line no-unused-vars
  app.use((erro, _req, res, _next) => {
    if (erro instanceof AppError) {
      return res.status(erro.status).json({ erro: erro.message, detalhes: erro.detalhes });
    }
    if (erro instanceof ZodError) {
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: erro.issues });
    }
    if (erro.type === 'entity.parse.failed') {
      return res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
    }
    if (erro.code === '23505') { // violação de unicidade no Postgres (ex.: e-mail já cadastrado)
      return res.status(409).json({ erro: 'Já existe um cadastro com esses dados.' });
    }
    console.error(erro);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { criarApp };
