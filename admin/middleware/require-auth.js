/**
 * require-auth.js — exige sesión iniciada para todo salvo /login, /logout
 * y los recursos estáticos imprescindibles para mostrar la pantalla de
 * login (hoja de estilos, favicon si lo hubiera).
 */
'use strict';

const RUTAS_PUBLICAS = ['/login', '/logout'];
const ESTATICOS_PUBLICOS = ['/styles.css'];

function requireAuth(req, res, next) {
  if (RUTAS_PUBLICAS.includes(req.path) || ESTATICOS_PUBLICOS.includes(req.path)) return next();
  if (req.session && req.session.usuario) return next();
  if (req.method === 'GET') {
    req.session.postLoginRedirect = req.originalUrl;
    return res.redirect('/login');
  }
  return res.status(401).render('login', { error: 'Tu sesión ha caducado. Inicia sesión de nuevo.', csrfToken: res.locals.csrfToken });
}

module.exports = requireAuth;
