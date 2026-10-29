const { Pool, types } = require('pg');
const config = require('./config');

// NUMERIC (oid 1700) volta como string por padrão; aqui os valores são pequenos e seguros como número.
types.setTypeParser(1700, (valor) => parseFloat(valor));

function criarPool(url = config.databaseUrl) {
  if (!url) {
    throw new Error('DATABASE_URL não definida. Copie .env.example para .env e preencha.');
  }
  const pool = new Pool({
    connectionString: url,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: config.dbPoolMax,
    idleTimeoutMillis: 10000,
  });
  // Conexões ociosas podem ser encerradas pelo banco/pooler; sem este handler o Node cairia.
  pool.on('error', (erro) => console.error('Erro em conexão ociosa do banco:', erro.message));
  return pool;
}

module.exports = { criarPool };
