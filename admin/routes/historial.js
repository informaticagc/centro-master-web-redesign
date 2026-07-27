'use strict';
const express = require('express');
const historial = require('../services/historial');

const router = express.Router();

router.get('/', (req, res) => {
  const entradas = historial.leer({ operacion: req.query.operacion || undefined, q: req.query.q || undefined });
  res.render('historial', { titulo: 'Historial', entradas, q: req.query.q || '', operacion: req.query.operacion || '' });
});

module.exports = router;
