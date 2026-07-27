'use strict';
const express = require('express');
const multer = require('multer');
const cfg = require('../config');
const images = require('../services/images');
const { verificarCsrfHeader } = require('../middleware/csrf');

const router = express.Router();

// multer en memoria: nunca escribe en disco con el nombre/ruta que decida
// el navegador — el nombre final siempre lo genera services/images.js.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: cfg.MAX_UPLOAD_BYTES },
});

const MIME_PERMITIDOS = ['image/webp', 'image/png', 'image/jpeg'];

router.post('/subir', upload.single('imagen'), (req, res) => {
  if (!verificarCsrfHeader(req)) return res.status(403).json({ ok: false, error: 'Token de seguridad inválido.' });
  if (!req.file) return res.status(400).json({ ok: false, error: 'No se ha recibido ninguna imagen.' });
  if (!MIME_PERMITIDOS.includes(req.file.mimetype)) {
    return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido (solo webp/png/jpg).' });
  }
  try {
    const nombreFinal = images.guardarImagenSubida(req.file.buffer, req.file.originalname);
    res.json({ ok: true, filename: nombreFinal, url: '/preview-site/assets/' + nombreFinal });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
