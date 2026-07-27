/**
 * rate-limit.js — protección básica contra fuerza bruta en /login.
 * En memoria (proceso único, panel local): suficiente para esta fase.
 * Clave = usuario + IP, para no bloquear a otras IPs por un usuario ajeno
 * ni permitir que cambiar de IP burle el límite del mismo usuario.
 */
'use strict';
const cfg = require('../config');

const intentos = new Map(); // clave -> { count, lockedUntil }

function clave(username, ip) {
  return (username || '') + '|' + (ip || '');
}

function estaBloqueado(username, ip) {
  const entry = intentos.get(clave(username, ip));
  if (!entry || !entry.lockedUntil) return false;
  if (Date.now() > entry.lockedUntil) {
    intentos.delete(clave(username, ip));
    return false;
  }
  return true;
}

function minutosRestantes(username, ip) {
  const entry = intentos.get(clave(username, ip));
  if (!entry || !entry.lockedUntil) return 0;
  return Math.max(1, Math.ceil((entry.lockedUntil - Date.now()) / 60000));
}

function registrarFallo(username, ip) {
  const k = clave(username, ip);
  const entry = intentos.get(k) || { count: 0, lockedUntil: null };
  entry.count += 1;
  if (entry.count >= cfg.LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + cfg.LOGIN_LOCKOUT_MIN * 60000;
    entry.count = 0;
  }
  intentos.set(k, entry);
}

function registrarExito(username, ip) {
  intentos.delete(clave(username, ip));
}

module.exports = { estaBloqueado, minutosRestantes, registrarFallo, registrarExito };
