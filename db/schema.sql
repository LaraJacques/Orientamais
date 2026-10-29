-- Orienta+ — esquema do banco de dados (PostgreSQL)
-- Idempotente: pode ser executado várias vezes (npm run db:migrate).

CREATE TABLE IF NOT EXISTS areas (
  id    SERIAL PRIMARY KEY,
  slug  TEXT UNIQUE NOT NULL,
  nome  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS escolas (
  id                 SERIAL PRIMARY KEY,
  nome               TEXT NOT NULL,
  cidade             TEXT,
  uf                 CHAR(2),
  -- código entregue à escola para cadastrar orientadores (evita que qualquer pessoa vire "orientador")
  codigo_orientador  TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS turmas (
  id             SERIAL PRIMARY KEY,
  escola_id      INT  NOT NULL REFERENCES escolas(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  ano_letivo     INT  NOT NULL,
  -- código que o aluno informa ao se cadastrar para entrar na turma
  codigo_acesso  TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  senha_hash  TEXT NOT NULL,
  papel       TEXT NOT NULL CHECK (papel IN ('aluno', 'orientador')),
  escola_id   INT REFERENCES escolas(id) ON DELETE SET NULL,
  turma_id    INT REFERENCES turmas(id)  ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carreiras (
  id                  SERIAL PRIMARY KEY,
  slug                TEXT UNIQUE NOT NULL,
  nome                TEXT NOT NULL,
  area_id             INT NOT NULL REFERENCES areas(id),
  rotina              TEXT NOT NULL,
  salario_min         NUMERIC(10,2) NOT NULL,
  salario_max         NUMERIC(10,2) NOT NULL CHECK (salario_max >= salario_min),
  mercado             TEXT NOT NULL,
  mercado_nivel       SMALLINT NOT NULL CHECK (mercado_nivel BETWEEN 1 AND 5),
  formacao            TEXT NOT NULL,
  duracao_anos        NUMERIC(3,1),
  -- TRUE enquanto os números forem exemplos e não vierem de fonte oficial (RAIS, Novo Caged, IBGE...)
  ilustrativo         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cursos (
  id             SERIAL PRIMARY KEY,
  nome           TEXT NOT NULL,
  instituicao    TEXT NOT NULL,
  cidade         TEXT NOT NULL,
  uf             CHAR(2) NOT NULL,
  regiao         TEXT NOT NULL CHECK (regiao IN ('norte','nordeste','centro-oeste','sudeste','sul')),
  area_id        INT NOT NULL REFERENCES areas(id),
  carreira_id    INT REFERENCES carreiras(id) ON DELETE SET NULL,
  nivel          TEXT NOT NULL CHECK (nivel IN ('tecnico','superior')),
  modalidade     TEXT NOT NULL CHECK (modalidade IN ('presencial','ead','hibrido')),
  rede           TEXT NOT NULL CHECK (rede IN ('publica','privada')),
  mensalidade    NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (mensalidade >= 0),  -- 0 = gratuito
  duracao_meses  INT NOT NULL CHECK (duracao_meses > 0),
  ilustrativo    BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (nome, instituicao, cidade)
);

CREATE TABLE IF NOT EXISTS perguntas (
  id     SERIAL PRIMARY KEY,
  ordem  INT UNIQUE NOT NULL,
  texto  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opcoes (
  id           SERIAL PRIMARY KEY,
  pergunta_id  INT NOT NULL REFERENCES perguntas(id) ON DELETE CASCADE,
  texto        TEXT NOT NULL,
  area_id      INT NOT NULL REFERENCES areas(id),
  peso         SMALLINT NOT NULL DEFAULT 1 CHECK (peso > 0),
  UNIQUE (pergunta_id, area_id)
);

CREATE TABLE IF NOT EXISTS tentativas (
  id                 SERIAL PRIMARY KEY,
  usuario_id         INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  area_principal_id  INT REFERENCES areas(id),
  pontuacao          JSONB NOT NULL            -- { "exatas": 3, "saude": 1, ... }
);

CREATE TABLE IF NOT EXISTS respostas (
  tentativa_id  INT NOT NULL REFERENCES tentativas(id) ON DELETE CASCADE,
  pergunta_id   INT NOT NULL REFERENCES perguntas(id),
  opcao_id      INT NOT NULL REFERENCES opcoes(id),
  PRIMARY KEY (tentativa_id, pergunta_id)
);

CREATE INDEX IF NOT EXISTS idx_cursos_regiao       ON cursos (regiao);
CREATE INDEX IF NOT EXISTS idx_cursos_uf           ON cursos (uf);
CREATE INDEX IF NOT EXISTS idx_cursos_area         ON cursos (area_id);
CREATE INDEX IF NOT EXISTS idx_cursos_mensalidade  ON cursos (mensalidade);
CREATE INDEX IF NOT EXISTS idx_carreiras_area      ON carreiras (area_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_turma      ON usuarios (turma_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_escola     ON usuarios (escola_id);
CREATE INDEX IF NOT EXISTS idx_tentativas_usuario  ON tentativas (usuario_id, criado_em DESC);
