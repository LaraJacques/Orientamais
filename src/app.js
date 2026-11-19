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
    // Só tentativas que FALHAM contam: uma turma inteira se cadastrando na mesma rede da escola não é bloqueada,
    // mas quem tenta adivinhar senhas continua limitado.
    skipSuccessfulRequests: true,
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
