-- Orienta+ — cadastra uma escola e define o código que os orientadores usam para criar conta.
-- 1) Troque os valores abaixo (nome, cidade, UF e, principalmente, o CÓDIGO).
-- 2) O código funciona como senha de cadastro de orientador: use algo longo e que não seja adivinhável.
-- 3) Rode no SQL Editor do Supabase e entregue o código só à coordenação/orientação da escola.

INSERT INTO escolas (nome, cidade, uf, codigo_orientador)
VALUES ('NOME DA ESCOLA', 'Manaus', 'AM', 'TROQUE-ESTE-CODIGO-2026')
ON CONFLICT (codigo_orientador) DO NOTHING;
