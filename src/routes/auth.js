const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const config = require('../config');
const { AppError, validar } = require('../errors');
const { autenticar, gerarToken } = require('../middleware/auth');

const registroSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome').max(120),
  email: z.string().trim().email('E-mail inválido').max(160),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres').max(72),
  papel: z.enum(['aluno', 'orientador']),
  codigo_turma: z.string().trim().max(40).optional(), // aluno (opcional)
  codigo_escola: z.string().trim().max(40).optional(), // orientador (obrigatório)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(160),
  senha: z.string().min(1).max(72),
});

// Hash falso para igualar o tempo de resposta quando o e-mail não existe.
const HASH_FALSO = bcrypt.hashSync('senha-qualquer', 4);

const publico = (u) => ({
  id: u.id, nome: u.nome, email: u.email, papel: u.papel, escola_id: u.escola_id, turma_id: u.turma_id,
});

module.exports = (pool) => {
  const router = express.Router();

  router.post('/registro', async (req, res) => {
    const dados = validar(registroSchema, req.body);
    const email = dados.email.toLowerCase();
    let escolaId = null;
    let turmaId = null;

    if (dados.papel === 'orientador') {
      if (!dados.codigo_escola) throw new AppError(400, 'Orientadores precisam informar o código da escola.');
      const { rows } = await pool.query('SELECT id FROM escolas WHERE codigo_orientador = $1', [dados.codigo_escola]);
      if (!rows.length) throw new AppError(400, 'Código da escola inválido.');
      escolaId = rows[0].id;
    } else if (dados.codigo_turma) {
      const { rows } = await pool.query('SELECT id, escola_id FROM turmas WHERE codigo_acesso = $1', [dados.codigo_turma]);
      if (!rows.length) throw new AppError(400, 'Código da turma inválido.');
      turmaId = rows[0].id;
      escolaId = rows[0].escola_id;
    }

    const senhaHash = await bcrypt.hash(dados.senha, config.bcryptRounds);
    // E-mail repetido dispara o erro 23505, tratado como 409 no handler global.
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, papel, escola_id, turma_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, nome, email, papel, escola_id, turma_id`,
      [dados.nome, email, senhaHash, dados.papel, escolaId, turmaId]
    );
    res.status(201).json({ token: gerarToken(rows[0]), usuario: publico(rows[0]) });
  });

  router.post('/login', async (req, res) => {
    const dados = validar(loginSchema, req.body);
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [dados.email.toLowerCase()]);
    const usuario = rows[0];
    const confere = await bcrypt.compare(dados.senha, usuario ? usuario.senha_hash : HASH_FALSO);
    if (!usuario || !confere) throw new AppError(401, 'E-mail ou senha incorretos.');
    res.json({ token: gerarToken(usuario), usuario: publico(usuario) });
  });

  router.get('/me', autenticar, async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.papel, u.escola_id, u.turma_id,
              t.nome AS turma_nome, e.nome AS escola_nome
       FROM usuarios u
       LEFT JOIN turmas t ON t.id = u.turma_id
       LEFT JOIN escolas e ON e.id = u.escola_id
       WHERE u.id = $1`,
      [req.usuario.id]
    );
    if (!rows.length) throw new AppError(401, 'Usuário não encontrado.');
    res.json(rows[0]);
  });

  return router;
};
