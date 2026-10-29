# Orienta+ — Backend

API REST da plataforma de orientação vocacional **Orienta+** (TCC — Sistemas de Informação, Fametro).
Stack do pré-projeto: **Node.js + Express + PostgreSQL**, com deploy na Vercel + Supabase.

## O que a API faz

| Módulo | O que entrega |
|---|---|
| **Teste vocacional** | Perguntas, pontuação por área de afinidade (calculada no servidor) e carreiras sugeridas |
| **Carreiras** | Rotina real, faixa salarial, situação do mercado e formação; **comparação lado a lado** de até 3 carreiras |
| **Cursos** | Busca de cursos técnicos e superiores por região, estado, orçamento, modalidade e área |
| **Recomendação** | Ranking de cursos que cruza perfil + orçamento + localização + mercado, com os **motivos** de cada sugestão |
| **Orientador** | Painel com dados **agregados** da turma/escola (distribuição de interesses, sugestões de ações) |
| **Auth** | Cadastro/login com JWT; papéis `aluno` e `orientador` |

## Rodando localmente

Pré-requisitos: Node 20+ e PostgreSQL.

```bash
npm install
cp .env.example .env          # edite DATABASE_URL e JWT_SECRET
createdb orienta              # ou crie o banco pelo pgAdmin
npm run db:setup              # cria as tabelas e carrega carreiras, cursos e perguntas
npm run dev                   # http://localhost:3000/api/health
```

Com `SEED_DEMO=true` o seed cria uma escola e uma turma de demonstração:

- código da turma (aluno): `TURMA3A-DEMO`
- código da escola (orientador): `ORIENTADOR-DEMO`

O arquivo `api.http` tem exemplos de todas as chamadas (extensão **REST Client** do VS Code).

## Testes

```bash
createdb orienta_test
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/orienta_test npm test
```

São 29 testes (pontuação, recomendação e integração da API). O nome do banco de teste **precisa conter "test"**:
a suíte apaga usuários, turmas e escolas ao iniciar e se recusa a rodar em outro banco.

## Endpoints

Erros seguem o formato `{ "erro": "mensagem", "detalhes": ... }`. Rotas protegidas usam `Authorization: Bearer <token>`.

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| GET | `/api/health` | público | Verifica API e banco |
| GET | `/api/areas` | público | Lista as 5 áreas |
| POST | `/api/auth/registro` | público | Cadastra aluno (`codigo_turma` opcional) ou orientador (`codigo_escola` obrigatório) |
| POST | `/api/auth/login` | público | Retorna `token` + `usuario` |
| GET | `/api/auth/me` | logado | Dados do usuário |
| GET | `/api/quiz/perguntas` | público | Perguntas e opções (sem expor a área de cada opção) |
| POST | `/api/quiz/respostas` | público* | Calcula o resultado. *Aluno logado também grava a tentativa |
| GET | `/api/quiz/resultado` | aluno | Último resultado salvo |
| GET | `/api/carreiras` | público | Lista (`?area=exatas&q=eng`) |
| GET | `/api/carreiras/comparar?slugs=a,b,c` | público | Comparação de 1 a 3 carreiras, com `destaques` |
| GET | `/api/carreiras/:slug` | público | Detalhe da carreira |
| GET | `/api/cursos` | público | Filtros: `regiao`, `uf`, `area`, `nivel`, `modalidade`, `rede`, `orcamento_max`, `gratuito`, `incluir_ead`, `q`, `limite`, `pagina` |
| POST | `/api/recomendacoes` | público* | Ranking de cursos. *Sem `pontuacao`, usa o último teste do aluno logado |
| GET | `/api/orientador/turmas` | orientador | Turmas da escola, com códigos de acesso |
| POST | `/api/orientador/turmas` | orientador | Cria turma (`nome`, `ano_letivo`) |
| GET | `/api/orientador/resumo?turma_id=` | orientador | Painel agregado da turma (ou da escola inteira, sem `turma_id`) |

### Como a recomendação funciona

Cada curso recebe uma nota de 0 a 100:

`50% afinidade com o perfil + 20% proximidade + 15% custo + 15% mercado de trabalho`

- **Orçamento é filtro, não só peso:** curso com mensalidade acima de `orcamento_max` é descartado. Gratuitos sempre passam.
- **Região também é filtro:** curso presencial fora do estado/região do aluno é descartado; EAD vale para qualquer lugar.
- Cada recomendação traz `motivos` (texto pronto para exibir), `compatibilidade` por critério e `custo_total_estimado`.
- Os pesos ficam em `src/services/recomendacao.js` (`PESOS`) e podem ser ajustados e justificados no TCC.
- Como é uma função pura, a evolução para **machine learning** (objetivo específico do pré-projeto) pode trocar só esse arquivo.

## Integrando com o front-end

O protótipo atual usa dados fixos. Para plugar a API, troque as constantes pelas chamadas:

```js
const API = 'http://localhost:3000/api';

// Teste: monta as perguntas e envia as respostas
const { perguntas } = await (await fetch(`${API}/quiz/perguntas`)).json();
const resultado = await (await fetch(`${API}/quiz/respostas`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ respostas: [{ pergunta_id: 1, opcao_id: 3 } /* ... uma por pergunta */] }),
})).json();

// Comparar carreiras
const cmp = await (await fetch(`${API}/carreiras/comparar?slugs=eng-software,medicina`)).json();

// Cursos por região e orçamento (valores vazios são ignorados)
const cursos = await (await fetch(`${API}/cursos?regiao=norte&orcamento_max=600`)).json();
```

Observação: no banco cada pergunta tem **5 opções** (uma por área, incluindo Humanas); no protótipo havia 4.
O front deve renderizar as opções que vêm da API.

## Deploy (Vercel + Supabase)

Um único projeto na Vercel serve **o site e a API no mesmo domínio**:

- `public/index.html` é o front-end (servido pela CDN da Vercel);
- `index.js` (raiz) exporta o app Express, que a Vercel detecta sozinha — não precisa de `vercel.json`;
- como site e API têm o mesmo endereço, não há problema de CORS (o front chama `/api`).

**1. Banco (Supabase)** — crie o projeto. Para criar as tabelas e carregar os dados **sem rodar nada no computador**:
abra **SQL Editor → New query**, cole o conteúdo de `db/setup-supabase.sql` e clique em **Run**
(pode rodar mais de uma vez). Depois clique em **Connect** e copie a string do **Transaction pooler**
(porta 6543; a conexão direta só tem IPv6 e não funciona bem com a Vercel) — ela vai na variável `DATABASE_URL`.

Alternativa pelo terminal: `.env` local apontando para o Supabase (`DATABASE_SSL=true`, `SEED_DEMO=false`) e `npm run db:setup`.

**2. Vercel** — *Add New → Project*, importe o repositório do GitHub. Se o backend estiver numa subpasta, ajuste
**Root Directory**. Deixe o *Framework Preset* em **Express** (ou Other) e não precisa de build command.

**3. Variáveis de ambiente** (Settings → Environment Variables, ambiente *Production*):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | string do Transaction pooler do Supabase |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | 32+ caracteres aleatórios (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `CORS_ORIGIN` | vazio ou `*` se o front estiver na própria Vercel |

Sem `JWT_SECRET` válido a API **recusa subir** em produção (de propósito). Depois de cadastrar as variáveis, faça *Redeploy*.

**4. Conferir** — abra `https://SEU-PROJETO.vercel.app/api/health` (deve responder `{"status":"ok"}`)
e depois a página inicial.

**Front em outro domínio (ex.: GitHub Pages)?** Em `public/index.html`, troque `API_PRODUCAO` por
`https://SEU-PROJETO.vercel.app/api` e defina `CORS_ORIGIN` na Vercel com o domínio do front
(só o domínio, ex.: `https://louiselara42.github.io`).

**Limitações conhecidas da Vercel (serverless)**
- O limite de tentativas de login (`express-rate-limit`) fica em memória de cada instância, então protege menos que em
  um servidor único. Para reforçar, ative o **Vercel Firewall** (rate limiting) no painel.
- Cada instância usa até 3 conexões ao banco (`DB_POOL_MAX`); o pooler do Supabase é o que segura picos de acesso.
- Escolha, em Settings → Functions, uma região próxima ao seu projeto Supabase.
- Em produção **não** use `SEED_DEMO=true`: crie as escolas reais com códigos próprios.

## Segurança e privacidade (LGPD)

- Senhas com bcrypt; login com mensagem genérica e limite de tentativas por IP (`express-rate-limit`).
- Orientador só se cadastra com o **código da escola**; só enxerga turmas da própria escola.
- O painel devolve **apenas agregados**. Se menos de `MIN_GRUPO_AGREGADO` (padrão 3) alunos fizeram o teste, os dados são ocultados.
- Os alunos são em sua maioria menores de idade: antes do piloto, defina com a escola o termo de consentimento
  (responsável legal) e a base legal para o tratamento dos dados.

## Dados ilustrativos

Salários, mercado, cursos e mensalidades em `db/data.js` são **exemplos** (campo `ilustrativo = true`, exposto na API).
Para a validação do TCC, substitua por fontes oficiais e cite-as nas referências:
RAIS/Novo Caged (MTE), PNAD Contínua (IBGE) e Cadastro e-MEC.

## Estrutura

```
db/        schema.sql, data.js (carreiras, cursos, perguntas), migrate.js, seed.js
index.js                       entrada da Vercel (exporta o app Express)
public/index.html              front-end (servido pela Vercel)
src/
  app.js, server.js, config.js, db.js, errors.js
  middleware/auth.js           JWT e papéis
  routes/                      auth, quiz, carreiras, cursos, recomendacoes, orientador
  services/                    pontuacao.js e recomendacao.js (funções puras)
test/                          unitários e de integração
```
