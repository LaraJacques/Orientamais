const jwt = require('jsonwebtoken');
const config = require('../config');
const { AppError } = require('../errors');

function extrairToken(req) {
  const [tipo, token] = (req.headers.authorization || '').split(' ');
  return tipo === 'Bearer' && token ? token : null;
}

function lerToken(token) {
  try {
    const p = jwt.verify(token, config.jwtSecret);
    return { id: Number(p.sub), papel: p.papel, escolaId: p.escola_id ?? null, turmaId: p.turma_id ?? null };
  } catch {
    throw new AppError(401, 'Token inválido ou expirado. Faça login novamente.');
  }
}

/** Exige login. Preenche req.usuario. */
function autenticar(req, _res, next) {
  const token = extrairToken(req);
  if (!token) throw new AppError(401, 'Autenticação necessária.');
  req.usuario = lerToken(token);
  next();
}

/** Aceita requisições anônimas; se houver token, ele precisa ser válido. */
function autenticarOpcional(req, _res, next) {
  const token = extrairToken(req);
  if (token) req.usuario = lerToken(token);
  next();
}

function exigirPapel(...papeis) {
  return (req, _res, next) => {
    if (!req.usuario || !papeis.includes(req.usuario.papel)) {
      throw new AppError(403, 'Você não tem permissão para acessar este recurso.');
    }
    next();
  };
}

function gerarToken(usuario) {
  return jwt.sign(
    { papel: usuario.papel, escola_id: usuario.escola_id, turma_id: usuario.turma_id },
    config.jwtSecret,
    { subject: String(usuario.id), expiresIn: config.jwtExpiraEm }
  );
}

module.exports = { autenticar, autenticarOpcional, exigirPapel, gerarToken };
