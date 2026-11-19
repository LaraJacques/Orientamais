// Lê perfis (JSON no stdin) e imprime as recomendações do motor Node ATUAL, usando os mesmos cursos exportados.
const fs = require('node:fs');
const path = require('node:path');
const { recomendarCursos } = require('../../src/services/recomendacao');

const cursos = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cursos.json'), 'utf8'));
const perfis = JSON.parse(fs.readFileSync(0, 'utf8'));
const t0 = process.hrtime.bigint();
const saida = perfis.map((p) => recomendarCursos(cursos, {
  pontuacao: p.pontuacao, uf: p.uf || undefined, orcamentoMax: p.orcamento_max ?? undefined,
}, 50));
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
if (process.env.MEDIR) console.error(`node: ${perfis.length} perfis em ${ms.toFixed(1)} ms`);
process.stdout.write(JSON.stringify(saida.map((r) => ({
  total_candidatos: r.total_candidatos,
  recomendacoes: r.recomendacoes.map((c) => ({ id: c.id, score: c.score })),
}))));
