// Entrada da Vercel: exporta o app Express (a Vercel detecta sozinha).
// O front-end fica em public/ e é servido pela CDN; aqui só garantimos que a raiz "/" leve até ele.
const express = require('express');
const { criarPool } = require('./src/db');
const { criarApp } = require('./src/app');

const app = express();
app.get('/', (req, res) => res.redirect(302, '/index.html'));
app.use(criarApp(criarPool()));

module.exports = app;
