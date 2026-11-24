// Dados iniciais do Orienta+.
// ATENÇÃO: salários, mensalidades e vagas são ILUSTRATIVOS (campo `ilustrativo = true`).
// Antes da validação com os estudantes, substitua por fontes oficiais:
//  - Salários e mercado: RAIS / Novo Caged (MTE), PNAD Contínua (IBGE)
//  - Cursos e instituições: Cadastro e-MEC (MEC) e Catálogo Nacional de Cursos Técnicos

const areas = [
  { slug: 'exatas', nome: 'Exatas & Tecnologia' },
  { slug: 'saude', nome: 'Saúde' },
  { slug: 'criativas', nome: 'Criativas' },
  { slug: 'negocios', nome: 'Negócios' },
  { slug: 'humanas', nome: 'Humanas' },
];

const carreiras = [
  {
    slug: 'eng-software', nome: 'Engenharia de Software', area: 'exatas',
    rotina: 'Escreve e revisa código, participa de reuniões ágeis diárias, testa funcionalidades e documenta o sistema junto ao time.',
    salario_min: 4500, salario_max: 9000,
    mercado: 'Alta demanda, sobretudo em tecnologia e fintechs; trabalho remoto é comum.',
    mercado_nivel: 5, formacao: 'Graduação em Computação, Sistemas de Informação ou Engenharia de Software', duracao_anos: 4,
  },
  {
    slug: 'ciencia-de-dados', nome: 'Ciência de Dados', area: 'exatas',
    rotina: 'Limpa e analisa bases de dados, constrói modelos estatísticos e painéis, e apresenta resultados para apoiar decisões.',
    salario_min: 5000, salario_max: 11000,
    mercado: 'Demanda crescente em bancos, saúde, varejo e setor público; exige estatística e programação.',
    mercado_nivel: 4, formacao: 'Graduação em Estatística, Computação ou Ciência de Dados (ou tecnólogo)', duracao_anos: 4,
  },
  {
    slug: 'arquitetura', nome: 'Arquitetura e Urbanismo', area: 'exatas',
    rotina: 'Cria projetos em softwares de modelagem, visita obras, apresenta propostas a clientes e acompanha a execução.',
    salario_min: 2500, salario_max: 7500,
    mercado: 'Acompanha o ritmo da construção civil; oscila conforme a economia.',
    mercado_nivel: 3, formacao: 'Bacharelado + registro no CAU', duracao_anos: 5,
  },
  {
    slug: 'medicina', nome: 'Medicina', area: 'saude',
    rotina: 'Atende pacientes em consultas ou plantões, faz diagnósticos e acompanha exames e prontuários.',
    salario_min: 8000, salario_max: 20000,
    mercado: 'Demanda estável e alta; exige residência médica (2 a 6 anos) para se especializar.',
    mercado_nivel: 5, formacao: 'Graduação, com residência opcional depois', duracao_anos: 6,
  },
  {
    slug: 'enfermagem', nome: 'Enfermagem', area: 'saude',
    rotina: 'Presta cuidado direto ao paciente, administra medicamentos e coordena a equipe técnica em plantões.',
    salario_min: 2200, salario_max: 5500,
    mercado: 'Alta demanda em hospitais e postos de saúde; jornadas podem incluir noites e fins de semana.',
    mercado_nivel: 5, formacao: 'Graduação (4 a 5 anos) ou curso técnico (2 anos) para nível médio', duracao_anos: 5,
  },
  {
    slug: 'psicologia', nome: 'Psicologia', area: 'humanas',
    rotina: 'Realiza atendimentos individuais ou em grupo, aplica avaliações, escreve relatórios e atua em escolas, empresas ou clínicas.',
    salario_min: 2500, salario_max: 8000,
    mercado: 'Procura crescente por saúde mental; renda varia muito entre consultório, empresas e setor público.',
    mercado_nivel: 3, formacao: 'Graduação + registro no CRP', duracao_anos: 5,
  },
  {
    slug: 'design', nome: 'Design (UX/Gráfico)', area: 'criativas',
    rotina: 'Pesquisa com usuários, cria wireframes e protótipos, testa a usabilidade e ajusta com o time de produto.',
    salario_min: 3000, salario_max: 8000,
    mercado: 'Em crescimento, principalmente design de produto em empresas de tecnologia.',
    mercado_nivel: 4, formacao: 'Graduação em Design ou cursos técnicos e bootcamps', duracao_anos: 4,
  },
  {
    slug: 'publicidade', nome: 'Publicidade e Propaganda', area: 'criativas',
    rotina: 'Cria campanhas, atende clientes, gerencia redes sociais e analisa métricas de resultado.',
    salario_min: 2500, salario_max: 6500,
    mercado: 'Em transformação constante; forte procura por quem domina marketing digital.',
    mercado_nivel: 3, formacao: 'Bacharelado ou cursos livres e técnicos', duracao_anos: 4,
  },
  {
    slug: 'administracao', nome: 'Administração', area: 'negocios',
    rotina: 'Planeja processos, gerencia equipes, analisa indicadores financeiros e participa de decisões estratégicas.',
    salario_min: 2800, salario_max: 7000,
    mercado: 'Setor amplo, mas competitivo; muitas vagas de entrada em diferentes indústrias.',
    mercado_nivel: 3, formacao: 'Bacharelado', duracao_anos: 4,
  },
  {
    slug: 'contabilidade', nome: 'Ciências Contábeis', area: 'negocios',
    rotina: 'Faz escrituração e conciliações, calcula impostos, elabora demonstrações financeiras e presta consultoria fiscal.',
    salario_min: 2500, salario_max: 7000,
    mercado: 'Demanda constante em escritórios, indústrias e setor público; concursos são um caminho comum.',
    mercado_nivel: 4, formacao: 'Bacharelado + registro no CRC', duracao_anos: 4,
  },
  {
    slug: 'direito', nome: 'Direito', area: 'humanas',
    rotina: 'Elabora petições, acompanha processos e audiências, e atende clientes sobre suas questões jurídicas.',
    salario_min: 2500, salario_max: 12000,
    mercado: 'Número alto de formados por vaga, mas com nichos aquecidos como direito digital e compliance.',
    mercado_nivel: 3, formacao: 'Bacharelado + exame da OAB', duracao_anos: 5,
  },
  {
    slug: 'pedagogia', nome: 'Pedagogia', area: 'humanas',
    rotina: 'Planeja aulas e atividades, acompanha o desenvolvimento dos alunos, conversa com famílias e participa da gestão escolar.',
    salario_min: 2200, salario_max: 5000,
    mercado: 'Vagas em escolas públicas (via concurso) e privadas; coordenação e orientação educacional ampliam a carreira.',
    mercado_nivel: 3, formacao: 'Licenciatura', duracao_anos: 4,
  },
];

// carreira = slug da carreira relacionada (define também a área do curso)
const cursos = [
  { nome: 'Técnico em Desenvolvimento de Sistemas', instituicao: 'Instituto Federal do Amazonas (IFAM)', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'eng-software', nivel: 'tecnico', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 24 },
  { nome: 'Técnico em Administração', instituicao: 'Instituto Federal do Amazonas (IFAM)', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'administracao', nivel: 'tecnico', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 24 },
  { nome: 'Ciência da Computação', instituicao: 'Universidade Federal do Amazonas (UFAM)', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'eng-software', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 48 },
  { nome: 'Sistemas de Informação', instituicao: 'Centro Universitário Fametro', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'eng-software', nivel: 'superior', modalidade: 'presencial', rede: 'privada', mensalidade: 450, duracao_meses: 48 },
  { nome: 'Administração', instituicao: 'Universidade Federal do Amazonas (UFAM)', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'administracao', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 48 },
  { nome: 'Ciências Contábeis', instituicao: 'Universidade Federal do Amazonas (UFAM)', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'contabilidade', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 48 },
  { nome: 'Enfermagem', instituicao: 'Universidade do Estado do Amazonas (UEA)', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'enfermagem', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 60 },
  { nome: 'Pedagogia', instituicao: 'Universidade do Estado do Amazonas (UEA)', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'pedagogia', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 48 },
  { nome: 'Psicologia', instituicao: 'Centro Universitário Fametro', cidade: 'Manaus', uf: 'AM', regiao: 'norte', carreira: 'psicologia', nivel: 'superior', modalidade: 'presencial', rede: 'privada', mensalidade: 1100, duracao_meses: 60 },
  { nome: 'Técnico em Enfermagem', instituicao: 'Escola Técnica Estadual', cidade: 'Belém', uf: 'PA', regiao: 'norte', carreira: 'enfermagem', nivel: 'tecnico', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 18 },
  { nome: 'Medicina', instituicao: 'Universidade Federal do Pará (UFPA)', cidade: 'Belém', uf: 'PA', regiao: 'norte', carreira: 'medicina', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 72 },
  { nome: 'Design Gráfico', instituicao: 'Centro Universitário do Recife', cidade: 'Recife', uf: 'PE', regiao: 'nordeste', carreira: 'design', nivel: 'superior', modalidade: 'presencial', rede: 'privada', mensalidade: 780, duracao_meses: 48 },
  { nome: 'Publicidade e Propaganda', instituicao: 'Faculdade Nordeste Digital', cidade: 'Salvador', uf: 'BA', regiao: 'nordeste', carreira: 'publicidade', nivel: 'superior', modalidade: 'ead', rede: 'privada', mensalidade: 220, duracao_meses: 48 },
  { nome: 'Administração', instituicao: 'Faculdade Central Brasília', cidade: 'Brasília', uf: 'DF', regiao: 'centro-oeste', carreira: 'administracao', nivel: 'superior', modalidade: 'ead', rede: 'privada', mensalidade: 190, duracao_meses: 48 },
  { nome: 'Enfermagem', instituicao: 'Universidade Católica de Goiás', cidade: 'Goiânia', uf: 'GO', regiao: 'centro-oeste', carreira: 'enfermagem', nivel: 'superior', modalidade: 'presencial', rede: 'privada', mensalidade: 890, duracao_meses: 60 },
  { nome: 'Direito', instituicao: 'Universidade Paulista de Direito', cidade: 'São Paulo', uf: 'SP', regiao: 'sudeste', carreira: 'direito', nivel: 'superior', modalidade: 'presencial', rede: 'privada', mensalidade: 1450, duracao_meses: 60 },
  { nome: 'Engenharia de Software', instituicao: 'PUC Minas', cidade: 'Belo Horizonte', uf: 'MG', regiao: 'sudeste', carreira: 'eng-software', nivel: 'superior', modalidade: 'hibrido', rede: 'privada', mensalidade: 1180, duracao_meses: 48 },
  { nome: 'Tecnologia em Ciência de Dados', instituicao: 'Faculdade EAD Nacional', cidade: 'São Paulo', uf: 'SP', regiao: 'sudeste', carreira: 'ciencia-de-dados', nivel: 'superior', modalidade: 'ead', rede: 'privada', mensalidade: 280, duracao_meses: 30 },
  { nome: 'Arquitetura e Urbanismo', instituicao: 'Universidade Federal de Santa Catarina (UFSC)', cidade: 'Florianópolis', uf: 'SC', regiao: 'sul', carreira: 'arquitetura', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 60 },
  { nome: 'Engenharia de Software', instituicao: 'Faculdade Positivo', cidade: 'Curitiba', uf: 'PR', regiao: 'sul', carreira: 'eng-software', nivel: 'superior', modalidade: 'presencial', rede: 'privada', mensalidade: 920, duracao_meses: 48 },
  { nome: 'Enfermagem', instituicao: 'Universidade Federal do Rio Grande do Sul (UFRGS)', cidade: 'Porto Alegre', uf: 'RS', regiao: 'sul', carreira: 'enfermagem', nivel: 'superior', modalidade: 'presencial', rede: 'publica', mensalidade: 0, duracao_meses: 60 },
  { nome: 'Publicidade e Propaganda', instituicao: 'ESPM', cidade: 'Porto Alegre', uf: 'RS', regiao: 'sul', carreira: 'publicidade', nivel: 'superior', modalidade: 'presencial', rede: 'privada', mensalidade: 1320, duracao_meses: 48 },
];

// Cada pergunta tem uma opção por área, para que todas as áreas possam ser alcançadas.
const perguntas = [
  {
    texto: 'No seu tempo livre, você prefere...',
    opcoes: {
      exatas: 'Montar, consertar coisas ou resolver quebra-cabeças lógicos',
      saude: 'Cuidar de alguém ou participar de ações voluntárias',
      criativas: 'Desenhar, criar conteúdo ou editar vídeos',
      negocios: 'Organizar eventos ou liderar um grupo de trabalho',
      humanas: 'Ler, debater ideias ou escrever sobre temas sociais',
    },
  },
  {
    texto: 'Em qual conjunto de matérias você costuma se sair melhor?',
    opcoes: {
      exatas: 'Matemática e Física',
      saude: 'Biologia e Química',
      criativas: 'Artes e Linguagens',
      negocios: 'Economia e Matemática aplicada',
      humanas: 'Sociologia, História e Filosofia',
    },
  },
  {
    texto: 'Um projeto escolar ideal para você envolveria...',
    opcoes: {
      exatas: 'Programar uma solução ou resolver um problema técnico',
      saude: 'Ajudar pessoas com um problema pessoal ou de saúde',
      criativas: 'Criar algo visualmente, como um cartaz ou vídeo',
      negocios: 'Planejar a estratégia e os recursos de um projeto',
      humanas: 'Pesquisar um problema da comunidade e propor mudanças',
    },
  },
  {
    texto: 'O que mais te incomodaria em um trabalho?',
    opcoes: {
      exatas: 'Tomar decisões sem lógica ou dados',
      saude: 'Um ambiente sem propósito humano ou social',
      criativas: 'Uma rotina sem espaço para criatividade',
      negocios: 'Falta de organização e metas claras',
      humanas: 'Não poder ensinar, orientar ou defender pessoas',
    },
  },
  {
    texto: 'Se pudesse escolher uma disciplina eletiva agora, seria...',
    opcoes: {
      exatas: 'Robótica ou tecnologia',
      saude: 'Primeiros socorros ou biologia aplicada',
      criativas: 'Produção audiovisual ou design',
      negocios: 'Empreendedorismo',
      humanas: 'Debate, direito ou psicologia',
    },
  },
  {
    texto: 'Daqui a 10 anos, você se imagina trabalhando...',
    opcoes: {
      exatas: 'Com sistemas, dados ou construção técnica',
      saude: 'Cuidando de pessoas ou da saúde de uma comunidade',
      criativas: 'Criando campanhas, produtos visuais ou conteúdos',
      negocios: 'Gerindo um negócio ou uma equipe',
      humanas: 'Educando, aconselhando ou atuando em causas sociais',
    },
  },
  {
    texto: 'Num trabalho em grupo, você costuma assumir o papel de...',
    opcoes: {
      exatas: 'Quem resolve a parte técnica e os detalhes difíceis',
      saude: 'Quem cuida do bem-estar e escuta o grupo',
      criativas: 'Quem pensa na ideia visual e na apresentação',
      negocios: 'Quem divide as tarefas e cobra os prazos',
      humanas: 'Quem pesquisa o tema e escreve a argumentação',
    },
  },
  {
    texto: 'Qual destes conteúdos da internet você mais gosta de acompanhar?',
    opcoes: {
      exatas: 'Tecnologia, ciência e como as coisas funcionam',
      saude: 'Saúde, bem-estar e comportamento humano',
      criativas: 'Arte, design, música e cinema',
      negocios: 'Negócios, finanças e empreendedorismo',
      humanas: 'Política, história e questões sociais',
    },
  },
  {
    texto: 'Diante de um problema novo, sua primeira reação é...',
    opcoes: {
      exatas: 'Quebrar em partes e buscar uma solução lógica',
      saude: 'Pensar em como isso afeta as pessoas envolvidas',
      criativas: 'Imaginar uma forma diferente e original de resolver',
      negocios: 'Avaliar custos, riscos e a melhor estratégia',
      humanas: 'Entender o contexto e ouvir pontos de vista diferentes',
    },
  },
  {
    texto: 'Qual destas conquistas te deixaria mais orgulhoso(a)?',
    opcoes: {
      exatas: 'Criar algo que funciona e resolve um problema técnico',
      saude: 'Ajudar alguém a se recuperar ou a se sentir melhor',
      criativas: 'Ver uma obra ou ideia sua admirada por outras pessoas',
      negocios: 'Ver um negócio ou projeto seu crescer e dar resultado',
      humanas: 'Ajudar alguém a aprender ou a defender seus direitos',
    },
  },
  {
    texto: 'Em uma feira de profissões, você iria primeiro a...',
    opcoes: {
      exatas: 'O espaço de robótica, engenharia e tecnologia',
      saude: 'O espaço de saúde e primeiros socorros',
      criativas: 'A exposição de arte, fotografia ou design',
      negocios: 'O estande de empreendedorismo e startups',
      humanas: 'O debate, a biblioteca ou o espaço de história',
    },
  },
  {
    texto: 'Qual atividade você faria por horas sem perceber o tempo passar?',
    opcoes: {
      exatas: 'Programar, montar circuitos ou resolver desafios de lógica',
      saude: 'Estudar o corpo humano ou cuidar de plantas e animais',
      criativas: 'Desenhar, filmar, tocar ou escrever histórias',
      negocios: 'Planejar um negócio ou administrar um jogo de estratégia',
      humanas: 'Conversar sobre ideias, ler ou escrever sobre pessoas',
    },
  },
  {
    texto: 'Se a escola recebesse uma verba para um projeto, você investiria em...',
    opcoes: {
      exatas: 'Equipamentos e ferramentas tecnológicas',
      saude: 'Uma campanha de saúde e cuidado com a comunidade',
      criativas: 'Um espaço de arte, estúdio ou produção de conteúdo',
      negocios: 'Uma feira de empreendedorismo ou uma empresa júnior',
      humanas: 'Um ciclo de palestras, debates e rodas de conversa',
    },
  },
  {
    texto: 'Qual frase mais combina com você?',
    opcoes: {
      exatas: 'Gosto de entender como as coisas funcionam por dentro',
      saude: 'Me sinto bem quando consigo cuidar dos outros',
      criativas: 'Preciso expressar o que penso e sinto de forma criativa',
      negocios: 'Gosto de desafios, metas e resultados concretos',
      humanas: 'Acredito que ideias e educação mudam a sociedade',
    },
  },
  {
    texto: 'Em um filme ou série, qual personagem te inspira mais?',
    opcoes: {
      exatas: 'O(a) cientista ou engenheiro(a) que inventa a solução',
      saude: 'O(a) médico(a) ou cuidador(a) dedicado(a)',
      criativas: 'O(a) artista ou criador(a) fora do padrão',
      negocios: 'O(a) empreendedor(a) ou líder que toma as decisões',
      humanas: 'O(a) professor(a), advogado(a) ou ativista que luta por justiça',
    },
  },
  {
    texto: 'Qual destes ambientes de trabalho você prefere?',
    opcoes: {
      exatas: 'Um laboratório, oficina ou escritório de tecnologia',
      saude: 'Um hospital, clínica ou centro comunitário',
      criativas: 'Um estúdio, agência criativa ou ateliê',
      negocios: 'Um escritório de negócios, banco ou empresa em crescimento',
      humanas: 'Uma escola, tribunal, ONG ou instituição pública',
    },
  },
  {
    texto: 'Quando você precisa aprender algo novo, prefere...',
    opcoes: {
      exatas: 'Testar na prática, errar e ajustar até funcionar',
      saude: 'Estudar casos reais e conversar com quem já viveu',
      criativas: 'Ver exemplos visuais, vídeos e referências criativas',
      negocios: 'Analisar números, resultados e exemplos de sucesso',
      humanas: 'Ler, discutir e escrever sobre o assunto',
    },
  },
  {
    texto: 'Que tipo de notícia chama mais a sua atenção?',
    opcoes: {
      exatas: 'Uma nova tecnologia ou descoberta científica',
      saude: 'Um avanço na medicina ou na saúde pública',
      criativas: 'Um lançamento de arte, moda, jogo ou design',
      negocios: 'Uma mudança na economia ou um negócio de sucesso',
      humanas: 'Uma mudança em leis, educação ou direitos das pessoas',
    },
  },
  {
    texto: 'O que mais te motiva a escolher uma profissão?',
    opcoes: {
      exatas: 'Resolver problemas complexos com inteligência',
      saude: 'Fazer diferença na vida das pessoas',
      criativas: 'Ter liberdade para criar e se expressar',
      negocios: 'Crescer, liderar e ter independência financeira',
      humanas: 'Contribuir para uma sociedade mais justa e instruída',
    },
  },
  {
    texto: 'Em uma situação de conflito entre colegas, você tende a...',
    opcoes: {
      exatas: 'Analisar os fatos de forma objetiva e propor uma solução lógica',
      saude: 'Acolher os dois lados e cuidar de quem está mais abalado',
      criativas: 'Quebrar o clima com criatividade e bom humor',
      negocios: 'Negociar e buscar um acordo que atenda a todos',
      humanas: 'Mediar o diálogo e explicar o ponto de vista de cada um',
    },
  },
];

// Modos do teste (aninhados: o médio contém o rápido e o completo contém o médio).
// A pergunta pertence ao modo pela sua ordem: ordem <= limite.
const modosQuiz = { rapido: 6, medio: 15, completo: 20 };

module.exports = { areas, carreiras, cursos, perguntas, modosQuiz };
