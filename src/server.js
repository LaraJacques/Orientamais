const config = require('./config');
const { criarPool } = require('./db');
const { criarApp } = require('./app');

const pool = criarPool();
const app = criarApp(pool);

const servidor = app.listen(config.porta, () => {
  console.log(`Orienta+ API rodando na porta ${config.porta} (${config.ambiente})`);
});

function encerrar() {
  servidor.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
