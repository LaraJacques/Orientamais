// Entrada para a Vercel (zero-config Express): importa o express e exporta o app como default.
// Localmente continue usando `npm run dev` / `npm start` (src/server.js).
const express = require('express');
const { criarPool } = require('./src/db');
const { criarApp } = require('./src/app');

const app = express();
app.use(criarApp(criarPool())); // o pool é criado uma vez por instância e reaproveitado entre requisições

module.exports = app;
