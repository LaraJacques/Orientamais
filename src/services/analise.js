// Análise de notas e do teste vocacional de um aluno. Funções puras (sem banco), fáceis de testar.
//
// IMPORTANTE: o mapa disciplina → área é uma HEURÍSTICA pedagógica para apoiar a conversa do orientador,
// não um diagnóstico. Os pesos/limites abaixo podem ser ajustados e justificados no TCC.

const MEDIA_APROVACAO = 6;      // abaixo disso a disciplina entra em "atenção"
const QUEDA_RELEVANTE = 1;      // queda (em pontos) entre dois bimestres que merece um olhar
const MARGEM_ALINHAMENTO = 0.5; // diferença mínima entre a área do perfil e a média geral para comentar

// Disciplinas aceitas no lançamento de notas e as áreas do teste a que cada uma se relaciona.
const DISCIPLINAS = {
  'Matemática':       ['exatas', 'negocios'],
  'Física':           ['exatas'],
  'Química':          ['exatas', 'saude'],
  'Biologia':         ['saude'],
  'Língua Portuguesa': ['humanas', 'criativas'],
  'Redação':          ['humanas', 'criativas'],
  'História':         ['humanas'],
  'Geografia':        ['humanas'],
  'Filosofia':        ['humanas'],
  'Sociologia':       ['humanas'],
  'Artes':            ['criativas'],
  'Inglês':           ['criativas', 'negocios'],
  'Educação Física':  ['saude'],
};

const NOMES_AREA = {
  exatas: 'Exatas & Tecnologia', saude: 'Saúde', criativas: 'Criativas', negocios: 'Negócios', humanas: 'Humanas',
};

const arredondar = (n) => Math.round(n * 10) / 10;
const media = (valores) => (valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null);

/**
 * @param {Array<{disciplina:string, periodo:number, nota:number}>} notas
 * @returns {Array<{disciplina, media, ultimo_periodo, ultima_nota, variacao, bimestres:Array}>} ordenado por disciplina
 */
function resumoPorDisciplina(notas) {
  const grupos = new Map();
  for (const n of notas) {
    if (!grupos.has(n.disciplina)) grupos.set(n.disciplina, []);
    grupos.get(n.disciplina).push({ periodo: Number(n.periodo), nota: Number(n.nota) });
  }
  return [...grupos.entries()]
    .map(([disciplina, lista]) => {
      const ordenada = lista.sort((a, b) => a.periodo - b.periodo);
      const ultima = ordenada[ordenada.length - 1];
      const anterior = ordenada.length > 1 ? ordenada[ordenada.length - 2] : null;
      return {
        disciplina,
        media: arredondar(media(ordenada.map((x) => x.nota))),
        ultimo_periodo: ultima.periodo,
        ultima_nota: ultima.nota,
        variacao: anterior ? arredondar(ultima.nota - anterior.nota) : null,
        bimestres: ordenada,
      };
    })
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, 'pt-BR'));
}

/** Média das disciplinas ligadas a cada área do teste. Áreas sem nota ficam de fora. */
function desempenhoPorArea(resumo) {
  const porArea = {};
  for (const d of resumo) {
    for (const area of DISCIPLINAS[d.disciplina] || []) {
      (porArea[area] ||= []).push(d.media);
    }
  }
  return Object.entries(porArea)
    .map(([area, valores]) => ({ area, nome: NOMES_AREA[area], media: arredondar(media(valores)), disciplinas: valores.length }))
    .sort((a, b) => b.media - a.media);
}

/**
 * Cruza as notas com a área principal do teste vocacional e gera observações em português
 * para o orientador. `areaPrincipal` é o slug (ou null se o aluno ainda não fez o teste).
 */
function analisarAluno({ notas, areaPrincipal }) {
  const resumo = resumoPorDisciplina(notas);
  const mediaGeral = resumo.length ? arredondar(media(resumo.map((d) => d.media))) : null;
  const porArea = desempenhoPorArea(resumo);

  const atencao = resumo
    .filter((d) => d.media < MEDIA_APROVACAO || (d.variacao !== null && d.variacao <= -QUEDA_RELEVANTE))
    .map((d) => ({
      disciplina: d.disciplina,
      motivo: d.media < MEDIA_APROVACAO && d.variacao !== null && d.variacao <= -QUEDA_RELEVANTE
        ? 'média baixa e queda no último bimestre'
        : d.media < MEDIA_APROVACAO ? 'média abaixo de 6' : 'queda de pelo menos 1 ponto no último bimestre',
    }));
  const destaques = resumo.filter((d) => d.media >= 8).map((d) => d.disciplina);

  const observacoes = [];
  let alinhamento = 'sem_dados';

  if (!resumo.length && !areaPrincipal) {
    observacoes.push('Ainda não há notas lançadas nem teste vocacional deste aluno.');
  } else if (!resumo.length) {
    observacoes.push(`O aluno fez o teste (área com mais afinidade: ${NOMES_AREA[areaPrincipal]}), mas ainda não há notas lançadas para cruzar.`);
  } else if (!areaPrincipal) {
    observacoes.push('O aluno ainda não fez o teste vocacional; peça para ele responder para cruzar com as notas.');
  } else {
    const dadoArea = porArea.find((a) => a.area === areaPrincipal);
    if (!dadoArea) {
      observacoes.push(`Não há notas em disciplinas ligadas a ${NOMES_AREA[areaPrincipal]} (área do teste) para comparar.`);
    } else if (dadoArea.media >= mediaGeral + MARGEM_ALINHAMENTO || (dadoArea.media >= 7 && dadoArea.media >= mediaGeral)) {
      alinhamento = 'alinhado';
      observacoes.push(`Perfil e notas caminham juntos: em ${NOMES_AREA[areaPrincipal]} a média é ${dadoArea.media}, acima da média geral (${mediaGeral}).`);
    } else if (dadoArea.media <= mediaGeral - MARGEM_ALINHAMENTO) {
      alinhamento = 'divergente';
      observacoes.push(`O interesse em ${NOMES_AREA[areaPrincipal]} é maior do que o desempenho atual na área (média ${dadoArea.media}, contra ${mediaGeral} no geral). Vale conversar sobre apoio nessas disciplinas e sobre o que atrai o aluno nela.`);
    } else {
      alinhamento = 'neutro';
      observacoes.push(`O desempenho em ${NOMES_AREA[areaPrincipal]} (média ${dadoArea.media}) está na linha da média geral (${mediaGeral}).`);
    }
    const melhor = porArea[0];
    if (melhor && melhor.area !== areaPrincipal && melhor.media >= mediaGeral + MARGEM_ALINHAMENTO) {
      observacoes.push(`As melhores notas estão em ${melhor.nome} (média ${melhor.media}), diferente da área do teste. Pode valer explorar essa área também.`);
    }
  }
  if (atencao.length) {
    observacoes.push(`Atenção em: ${atencao.map((a) => `${a.disciplina} (${a.motivo})`).join('; ')}.`);
  }
  if (destaques.length) observacoes.push(`Destaques (média 8 ou mais): ${destaques.join(', ')}.`);

  return { media_geral: mediaGeral, por_disciplina: resumo, por_area: porArea, atencao, destaques, alinhamento, observacoes };
}

module.exports = {
  DISCIPLINAS, NOMES_AREA, MEDIA_APROVACAO, QUEDA_RELEVANTE,
  resumoPorDisciplina, desempenhoPorArea, analisarAluno,
};
