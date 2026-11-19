-- Orienta+ — migração do painel do orientador (notas + autorização do aluno).
-- Cole no SQL Editor do Supabase e clique em Run. É seguro rodar mais de uma vez.
-- RODE ISTO ANTES de publicar o código novo: o cadastro passa a usar as colunas novas.

-- ===== Painel do orientador (v2) =====
-- Autorização do aluno (e, se menor de 18, do responsável) para o orientador da escola ver notas e respostas.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS consentimento_orientador BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS consentimento_em TIMESTAMPTZ;

-- Notas lançadas pelo orientador, por disciplina e bimestre (uma nota por aluno/disciplina/bimestre).
CREATE TABLE IF NOT EXISTS notas (
  id           SERIAL PRIMARY KEY,
  aluno_id     INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  disciplina   TEXT NOT NULL,
  periodo      SMALLINT NOT NULL CHECK (periodo BETWEEN 1 AND 4),   -- bimestre
  nota         NUMERIC(3,1) NOT NULL CHECK (nota BETWEEN 0 AND 10),
  lancado_por  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, disciplina, periodo)
);
CREATE INDEX IF NOT EXISTS idx_notas_aluno ON notas (aluno_id);
