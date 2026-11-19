// Exporta os dados do backend Node (db/data.js) para JSON, para a PoC em Python usar exatamente os mesmos cursos.
// Uso (na raiz do repositório): node poc-fastapi/scripts/exportar_dados.js
const fs = require('node:fs');
const path = require('node:path');
const { areas, carreiras, cursos } = require('../../db/data');
const { REGIAO_POR_UF } = require('../../src/services/recomendacao');

const porSlug = Object.fromEntries(carreiras.map((c) => [c.slug, c]));
const areaPorSlug = Object.fromEntries(areas.map((a) => [a.slug, a]));
const saida = cursos.map((c, i) => {
  const car = porSlug[c.carreira];
  return {
    id: i + 1, ...c,
    area: car.area, area_nome: areaPorSlug[car.area].nome, mercado_nivel: car.mercado_nivel,
  };
});
const dir = path.join(__dirname, '..', 'data');
fs.writeFileSync(path.join(dir, 'cursos.json'), JSON.stringify(saida, null, 2));
fs.writeFileSync(path.join(dir, 'areas.json'), JSON.stringify(areas.map((a) => ({ slug: a.slug, nome: a.nome })), null, 2));
fs.writeFileSync(path.join(dir, 'regioes.json'), JSON.stringify(REGIAO_POR_UF, null, 2));
console.log(`${saida.length} cursos, ${areas.length} áreas exportados.`);
