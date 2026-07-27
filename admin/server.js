/**
 * server.js — Panel interno de gestión de cursos (Fase 4B).
 *
 * IMPORTANTE:
 *  - Esta app NUNCA se publica: no forma parte de web/, no la toca
 *    GitHub Pages, no depende de él.
 *  - Requiere autenticación (ver admin/README.md). Por defecto escucha
 *    solo en 127.0.0.1 — exponerlo en red exige configurar ADMIN_HOST
 *    explícitamente y es responsabilidad de quien lo despliegue.
 *  - debug/reflejo de errores desactivado salvo NODE_ENV=development.
 */
'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const cfg = require('./config');
const csrfMiddleware = require('./middleware/csrf');
const requireAuth = require('./middleware/require-auth');

// ---------------------------------------------------------------------
// Comprobación de variables de entorno obligatorias — mensaje claro y
// parada inmediata si falta alguna (nunca arrancar con valores por defecto
// conocidos ni contraseñas de fábrica).
// ---------------------------------------------------------------------
const faltantes = cfg.REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (faltantes.length) {
  console.error('\nFaltan variables de entorno obligatorias: ' + faltantes.join(', '));
  console.error('Copia admin/.env.example a admin/.env y rellénalas.');
  console.error('Genera el hash de contraseña con: node admin/scripts/hash-password.js\n');
  process.exit(1);
}

const app = express();
const isDev = process.env.NODE_ENV === 'development';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  name: 'cem_admin_sid',
  secret: cfg.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.ADMIN_COOKIE_SECURE,
    maxAge: cfg.ADMIN_SESSION_MAX_AGE_MIN * 60000,
  },
}));

app.use(csrfMiddleware);
app.use('/', require('./routes/auth'));
app.use(requireAuth);

app.locals.cfg = cfg;
app.use((req, res, next) => {
  res.locals.usuarioActual = req.session.usuario || null;
  res.locals.dryRun = cfg.ADMIN_PUBLISH_DRY_RUN;
  next();
});

// ---------------------------------------------------------------------
// Vista previa local: sirve /web/ tal cual (nunca la web publicada), con
// un aviso visual inyectado para que nunca se confunda con producción.
// ---------------------------------------------------------------------
const BANNER = '<div style="position:sticky;top:0;z-index:99999;background:#1a7cd8;color:#fff;' +
  'font:600 13px/1 -apple-system,sans-serif;padding:8px 16px;text-align:center;">' +
  '🔧 VISTA PREVIA LOCAL — generada desde el panel administrativo, no es la web publicada</div>';

app.use('/preview-site', (req, res, next) => {
  const rel = decodeURIComponent(req.path.replace(/^\//, ''));
  const candidatos = [
    path.join(cfg.WEB_DIR, rel),
    path.join(cfg.WEB_DIR, rel, 'index.html'),
    path.join(cfg.WEB_DIR, rel + '.html'),
  ];
  const filePath = candidatos.find((p) => p.startsWith(cfg.WEB_DIR) && fs.existsSync(p) && fs.statSync(p).isFile());
  if (!filePath || path.extname(filePath) !== '.html') return next();
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return next();
    const conBanner = html.replace(/<body[^>]*>/i, (m) => m + BANNER);
    res.set('Content-Type', 'text/html; charset=utf-8').send(conBanner);
  });
});
app.use('/preview-site', express.static(cfg.WEB_DIR, { extensions: ['html'] }));

// ---------------------------------------------------------------------
app.get('/', require('./routes/dashboard'));
app.use('/cursos', require('./routes/cursos'));
app.use('/images', require('./routes/images'));
app.use('/papelera', require('./routes/trash'));
app.use('/historial', require('./routes/historial'));
app.use('/publicar', require('./routes/publish'));

app.use((req, res) => {
  res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Página no encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    titulo: 'Error interno',
    mensaje: isDev ? String(err.stack) : 'Ha ocurrido un error. Revisa la consola del panel.',
  });
});

app.listen(cfg.ADMIN_PORT, cfg.ADMIN_HOST, () => {
  console.log('Panel administrativo escuchando en http://' + cfg.ADMIN_HOST + ':' + cfg.ADMIN_PORT);
  if (cfg.ADMIN_PUBLISH_DRY_RUN) console.log('MODO SIMULACIÓN activo: la publicación no ejecutará commit/push reales.');
  if (cfg.ADMIN_HOST !== '127.0.0.1') console.log('AVISO: escuchando fuera de localhost (' + cfg.ADMIN_HOST + ') — asegúrate de que es intencional.');
});
