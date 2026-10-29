const data = require('./data');
const { criarPool } = require('../src/db');

// Idempotente: pode rodar várias vezes sem duplicar registros.
async function popular(pool, { demo = false } = {}) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    // Áreas
    for (const a of data.areas) {
      await cliente.query(
        `INSERT INTO areas (slug, nome) VALUES ($1, $2)
         ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome`,
        [a.slug, a.nome]
      );
    }
    const { rows: areaRows } = await cliente.query('SELECT id, slug FROM areas');
    const areaId = Object.fromEntries(areaRows.map((r) => [r.slug, r.id]));

    // Carreiras
    for (const c of data.carreiras) {
      await cliente.query(
        `INSERT INTO carreiras
           (slug, nome, area_id, rotina, salario_min, salario_max, mercado, mercado_nivel, formacao, duracao_anos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (slug) DO UPDATE SET
           nome = EXCLUDED.nome, area_id = EXCLUDED.area_id, rotina = EXCLUDED.rotina,
           salario_min = EXCLUDED.salario_min, salario_max = EXCLUDED.salario_max,
           mercado = EXCLUDED.mercado, mercado_nivel = EXCLUDED.mercado_nivel,
           formacao = EXCLUDED.formacao, duracao_anos = EXCLUDED.duracao_anos`,
        [c.slug, c.nome, areaId[c.area], c.rotina, c.salario_min, c.salario_max,
         c.mercado, c.mercado_nivel, c.formacao, c.duracao_anos]
      );
    }
    const { rows: carreiraRows } = await cliente.query('SELECT id, slug, area_id FROM carreiras');
    const carreira = Object.fromEntries(carreiraRows.map((r) => [r.slug, r]));

    // Cursos
    for (const c of data.cursos) {
      const ref = carreira[c.carreira];
      if (!ref) throw new Error(`Curso "${c.nome}" aponta para carreira inexistente: ${c.carreira}`);
      await cliente.query(
        `INSERT INTO cursos
           (nome, instituicao, cidade, uf, regiao, area_id, carreira_id, nivel, modalidade, rede, mensalidade, duracao_meses)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (nome, instituicao, cidade) DO UPDATE SET
           uf = EXCLUDED.uf, regiao = EXCLUDED.regiao, area_id = EXCLUDED.area_id,
           carreira_id = EXCLUDED.carreira_id, nivel = EXCLUDED.nivel, modalidade = EXCLUDED.modalidade,
           rede = EXCLUDED.rede, mensalidade = EXCLUDED.mensalidade, duracao_meses = EXCLUDED.duracao_meses`,
        [c.nome, c.instituicao, c.cidade, c.uf, c.regiao, ref.area_id, ref.id,
         c.nivel, c.modalidade, c.rede, c.mensalidade, c.duracao_meses]
      );
    }

    // Perguntas e opções do teste vocacional
    for (const [indice, p] of data.perguntas.entries()) {
      const ordem = indice + 1;
      const { rows } = await cliente.query(
        `INSERT INTO perguntas (ordem, texto) VALUES ($1, $2)
         ON CONFLICT (ordem) DO UPDATE SET texto = EXCLUDED.texto
         RETURNING id`,
        [ordem, p.texto]
      );
      for (const [slug, texto] of Object.entries(p.opcoes)) {
        await cliente.query(
          `INSERT INTO opcoes (pergunta_id, texto, area_id) VALUES ($1, $2, $3)
           ON CONFLICT (pergunta_id, area_id) DO UPDATE SET texto = EXCLUDED.texto`,
          [rows[0].id, texto, areaId[slug]]
        );
      }
    }

    // Escola e turma de demonstração (códigos públicos — use apenas em desenvolvimento)
    if (demo) {
      const { rows: escola } = await cliente.query(
        `INSERT INTO escolas (nome, cidade, uf, codigo_orientador)
         VALUES ('Escola Demonstração', 'Manaus', 'AM', 'ORIENTADOR-DEMO')
         ON CONFLICT (codigo_orientador) DO UPDATE SET nome = EXCLUDED.nome
         RETURNING id`
      );
      await cliente.query(
        `INSERT INTO turmas (escola_id, nome, ano_letivo, codigo_acesso)
         VALUES ($1, '3º Ano A', 2026, 'TURMA3A-DEMO')
         ON CONFLICT (codigo_acesso) DO NOTHING`,
        [escola[0].id]
      );
    }

    await cliente.query('COMMIT');
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}

module.exports = { popular };

if (require.main === module) {
  const pool = criarPool();
  const demo = process.env.SEED_DEMO === 'true';
  popular(pool, { demo })
    .then(() => console.log(`✔ Dados iniciais carregados${demo ? ' (com escola/turma de demonstração)' : ''}.`))
    .catch((erro) => {
      console.error('✖ Falha ao popular o banco:', erro.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
