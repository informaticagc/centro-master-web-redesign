/**
 * git-service.js — todas las operaciones Git que ejecuta el panel.
 *
 * Reglas fijas, no configurables desde el navegador:
 *  - remote  siempre cfg.GIT_REMOTE ('origin')
 *  - rama    siempre cfg.GIT_BRANCH ('design'); nunca main/master
 *  - todo se ejecuta con execFileSync('git', [...args fijos...], {cwd:ROOT}):
 *    nunca una cadena de shell, nunca argumentos construidos por
 *    concatenación con datos arbitrarios del usuario.
 *  - nunca pull/merge/rebase/reset/force-push automáticos.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

function git(args, opts) {
  return execFileSync('git', args, Object.assign({ cwd: cfg.ROOT, encoding: 'utf8' }, opts || {})).trim();
}

function repoValido() {
  return fs.existsSync(path.join(cfg.ROOT, '.git'));
}

function ramaActual() {
  return git(['rev-parse', '--abbrev-ref', 'HEAD']);
}

function remoteUrl() {
  try {
    return git(['remote', 'get-url', cfg.GIT_REMOTE]);
  } catch (e) {
    return null;
  }
}

function remotePermitido() {
  const url = remoteUrl();
  return !!url && url.includes(cfg.GIT_REMOTE_URL_FRAGMENT);
}

/** git status --porcelain, parseado. */
function estadoArchivos() {
  const salida = git(['status', '--porcelain']);
  if (!salida) return [];
  return salida.split('\n').map((linea) => ({
    estado: linea.slice(0, 2).trim(),
    archivo: linea.slice(3),
  }));
}

function estaLimpio() {
  return estadoArchivos().length === 0;
}

function ultimoCommitLocal() {
  try {
    const raw = git(['log', '-1', '--format=%H%x1f%s%x1f%ci']);
    const [hash, asunto, fecha] = raw.split('\x1f');
    return { hash, asunto, fecha };
  } catch (e) {
    return null;
  }
}

/** Último commit conocido de origin/design SIN contactar la red (usa lo que ya se sepa localmente). */
function ultimoCommitRemotoConocido() {
  try {
    const raw = git(['log', '-1', '--format=%H%x1f%s%x1f%ci', cfg.GIT_REMOTE + '/' + cfg.GIT_BRANCH]);
    const [hash, asunto, fecha] = raw.split('\x1f');
    return { hash, asunto, fecha };
  } catch (e) {
    return null;
  }
}

/** git fetch origin design — única llamada de red, siempre explícita y con rama fija. */
function fetchDesign() {
  git(['fetch', cfg.GIT_REMOTE, cfg.GIT_BRANCH]);
}

/** Tras fetchDesign(), calcula cuántos commits de diferencia hay en cada sentido. */
function divergencia() {
  const raw = git(['rev-list', '--left-right', '--count', 'HEAD...' + cfg.GIT_REMOTE + '/' + cfg.GIT_BRANCH]);
  const [aheadStr, behindStr] = raw.split(/\s+/);
  return { ahead: Number(aheadStr) || 0, behind: Number(behindStr) || 0 };
}

/** git add -- <archivos>. Nunca '.', nunca '-A'. Lista explícita y no vacía. */
function add(archivos) {
  if (!Array.isArray(archivos) || archivos.length === 0) {
    throw new Error('Lista de archivos vacía: no se añade nada por seguridad.');
  }
  git(['add', '--'].concat(archivos));
}

function commit(mensaje) {
  git(['commit', '-m', mensaje]);
}

function push() {
  git(['push', cfg.GIT_REMOTE, cfg.GIT_BRANCH]);
}

module.exports = {
  repoValido, ramaActual, remoteUrl, remotePermitido,
  estadoArchivos, estaLimpio, ultimoCommitLocal, ultimoCommitRemotoConocido,
  fetchDesign, divergencia, add, commit, push,
};
