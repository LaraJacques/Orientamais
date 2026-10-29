class AppError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

const naoEncontrado = (mensagem = 'Recurso não encontrado') => new AppError(404, mensagem);

// Valida dados com um schema zod e devolve um 400 legível em caso de erro.
function validar(schema, dados) {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    const detalhes = resultado.error.issues.map((i) => ({
      campo: i.path.join('.'),
      mensagem: i.message,
    }));
    throw new AppError(400, 'Dados inválidos', detalhes);
  }
  return resultado.data;
}

// O front-end envia filtros vazios ("Todas as regiões" = ""); aqui eles viram "não informado".
function limparFiltros(query) {
  return Object.fromEntries(
    Object.entries(query).filter(([, valor]) => valor !== '' && valor !== undefined)
  );
}

module.exports = { AppError, naoEncontrado, validar, limparFiltros };
