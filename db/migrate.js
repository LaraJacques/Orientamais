const fs = require('node:fs');
const path = require('node:path');
const { criarPool } = require('../src/db');

async function migrar(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { migrar };

if (require.main === module) {
  const pool = criarPool();
  migrar(pool)
    .then(() => console.log('✔ Esquema aplicado.'))
    .catch((erro) => {
      console.error('✖ Falha na migração:', erro.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
