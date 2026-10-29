require('dotenv').config({ quiet: true });

const env = process.env;
const emProducao = env.NODE_ENV === 'production';
const emTeste = env.NODE_ENV === 'test';

if (emProducao && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('Defina JWT_SECRET com pelo menos 32 caracteres em produção.');
}

module.exports = {
  ambiente: env.NODE_ENV || 'development',
  emProducao,
  porta: Number(env.PORT) || 3000,
  databaseUrl: env.DATABASE_URL,
  databaseSsl: env.DATABASE_SSL === 'true', // necessário para Supabase
  dbPoolMax: Number(env.DB_POOL_MAX) || (env.VERCEL ? 3 : 10), // na Vercel cada instância usa poucas conexões
  jwtSecret: env.JWT_SECRET || 'segredo-apenas-para-desenvolvimento',
  jwtExpiraEm: env.JWT_EXPIRES_IN || '8h',
  corsOrigin: env.CORS_ORIGIN || '*', // em produção: URL do front-end (ex.: https://orienta-plus.vercel.app)
  bcryptRounds: emTeste ? 4 : 10,
  limiteAuth: emTeste ? 10000 : 20, // tentativas de login/cadastro por IP a cada 15 min
  // Painel do orientador: abaixo desse nº de alunos com teste, os agregados são ocultados
  // para não permitir identificar respostas individuais (LGPD — dados de menores).
  minGrupoAgregado: Number(env.MIN_GRUPO_AGREGADO ?? 3),
};
