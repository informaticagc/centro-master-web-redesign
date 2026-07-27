/**
 * csrf.js — protección CSRF mínima, sin dependencias adicionales.
 * Genera un token por sesión (cookie httpOnly vía express-session) y lo
 * exige en cada POST como campo oculto _csrf. Suficiente para una
 * herramienta interna de un solo usuario a la vez; la autenticación
 * completa queda para una subfase posterior (ver informe).
 */
'use strict';
const crypto = require('crypto');

function csrfMiddleware(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  // Las peticiones multipart/form-data (subida de imágenes) las procesa
  // multer más adelante, por ruta: express.urlencoded/json de aquí arriba
  // nunca rellena req.body para ellas, así que no se puede comprobar el
  // token en este punto. Esas rutas verifican el token por su cuenta
  // (cabecera X-CSRF-Token) una vez multer ha parseado la petición — ver
  // routes/images.js.
  const esMultipart = (req.headers['content-type'] || '').indexOf('multipart/form-data') === 0;
  if (req.method === 'POST' && !esMultipart) {
    const enviado = req.body && req.body._csrf;
    if (!enviado || enviado !== req.session.csrfToken) {
      res.status(403);
      return res.render('error', { titulo: 'Solicitud rechazada', mensaje: 'Token de seguridad inválido o caducado. Vuelve atrás y reintenta.' });
    }
  }
  next();
}

function verificarCsrfHeader(req) {
  const enviado = req.headers['x-csrf-token'];
  return !!enviado && req.session && enviado === req.session.csrfToken;
}

module.exports = csrfMiddleware;
module.exports.verificarCsrfHeader = verificarCsrfHeader;
