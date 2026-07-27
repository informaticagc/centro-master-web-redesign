/**
 * config.js — rutas y constantes compartidas del panel administrativo.
 *
 * Todo lo que este panel toca vive fuera de /admin/ únicamente en
 * /web/data/cursos.json (fuente única), /web/assets/ (imágenes) y las
 * fichas generadas en /web/cursos/. El panel nunca escribe en /design/,
 * /scripts/ (salvo invocarlos como subprocesos), ni /data-internal/.
 */
'use strict';
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');
const DATA_DIR = path.join(WEB_DIR, 'data');
const ASSETS_DIR = path.join(WEB_DIR, 'assets');
const CURSOS_JSON = path.join(DATA_DIR, 'cursos.json');
const SEDES_JSON = path.join(DATA_DIR, 'sedes.json');

const ADMIN_DATA_DIR = path.join(__dirname, 'data');
const BACKUPS_DIR = path.join(ADMIN_DATA_DIR, 'backups');
const TMP_DIR = path.join(ADMIN_DATA_DIR, 'tmp');
const TRASH_DIR = path.join(ADMIN_DATA_DIR, 'trash');
const HISTORIAL_DIR = path.join(ADMIN_DATA_DIR, 'historial');
const HISTORIAL_FILE = path.join(HISTORIAL_DIR, 'operaciones.jsonl');
const LOCKS_DIR = path.join(TMP_DIR, 'locks');

const VALIDATE_SCRIPT = path.join(ROOT, 'scripts', 'validate-data.js');
const BUILD_FICHAS_SCRIPT = path.join(ROOT, 'scripts', 'build-fichas.js');

const ESTADOS = [
  'borrador', 'proximamente', 'matricula-abierta', 'ultimas-plazas',
  'en-curso', 'finalizado', 'archivado',
];
const ESTADOS_PUBLICABLES = ['proximamente', 'matricula-abierta', 'ultimas-plazas', 'en-curso', 'finalizado'];
const MODALIDADES = ['presencial', 'teleformacion'];
const TIPOS_PRECIO = ['gratuito', 'privado'];
const NIVELES = ['nivel-1', 'nivel-2', 'nivel-3'];
const SITUACIONES_DESTINATARIA = ['desempleado', 'ocupado'];

const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg'];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

// ---------------------------------------------------------------------
// Git / publicación — todo fijo en servidor, nada configurable desde el
// navegador (ver informe, sección "Controles Git obligatorios").
// ---------------------------------------------------------------------
const GIT_REMOTE = 'origin';
const GIT_BRANCH = 'design';
const GIT_FORBIDDEN_BRANCHES = ['main', 'master'];
// Fragmento que debe aparecer en la URL del remote 'origin' para considerarlo
// el repositorio correcto (evita publicar por error en un remote distinto).
const GIT_REMOTE_URL_FRAGMENT = 'centro-master-web-redesign';
const PUBLISH_BASE_URL = 'https://informaticagc.github.io/centro-master-web-redesign/design-preview/';
const LOCK_STALE_MS = 5 * 60 * 1000; // 5 minutos

// ---------------------------------------------------------------------
// Variables de entorno (ver .env.example)
// ---------------------------------------------------------------------
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const ADMIN_HOST = process.env.ADMIN_HOST || '127.0.0.1';
const ADMIN_PORT = Number(process.env.ADMIN_PORT) || 4000;
const ADMIN_COOKIE_SECURE = process.env.ADMIN_COOKIE_SECURE === 'true';
const ADMIN_SESSION_MAX_AGE_MIN = Number(process.env.ADMIN_SESSION_MAX_AGE_MIN) || 60;
const ADMIN_PUBLISH_DRY_RUN = process.env.ADMIN_PUBLISH_DRY_RUN !== 'false'; // por defecto TRUE (seguro)
const LOGIN_MAX_ATTEMPTS = Number(process.env.ADMIN_LOGIN_MAX_ATTEMPTS) || 5;
const LOGIN_LOCKOUT_MIN = Number(process.env.ADMIN_LOGIN_LOCKOUT_MIN) || 15;

const REQUIRED_ENV_VARS = ['ADMIN_USERNAME', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET'];

module.exports = {
  ROOT, WEB_DIR, DATA_DIR, ASSETS_DIR, CURSOS_JSON, SEDES_JSON,
  ADMIN_DATA_DIR, BACKUPS_DIR, TMP_DIR, TRASH_DIR, HISTORIAL_DIR, HISTORIAL_FILE, LOCKS_DIR,
  VALIDATE_SCRIPT, BUILD_FICHAS_SCRIPT,
  ESTADOS, ESTADOS_PUBLICABLES, MODALIDADES, TIPOS_PRECIO, NIVELES, SITUACIONES_DESTINATARIA,
  IMAGE_EXTENSIONS, MAX_UPLOAD_BYTES,
  GIT_REMOTE, GIT_BRANCH, GIT_FORBIDDEN_BRANCHES, GIT_REMOTE_URL_FRAGMENT, PUBLISH_BASE_URL, LOCK_STALE_MS,
  ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET, ADMIN_HOST, ADMIN_PORT,
  ADMIN_COOKIE_SECURE, ADMIN_SESSION_MAX_AGE_MIN, ADMIN_PUBLISH_DRY_RUN,
  LOGIN_MAX_ATTEMPTS, LOGIN_LOCKOUT_MIN, REQUIRED_ENV_VARS,
};
