/**
 * lock.js — bloqueos de archivo simples para evitar que dos operaciones
 * escriban el catálogo o publiquen a la vez. No depende de un servidor
 * externo (Redis, etc.) — un fichero marcador con PID + hora es suficiente
 * para un panel local de un solo proceso.
 *
 * Un bloqueo más antiguo que LOCK_STALE_MS se considera huérfano (p.ej. el
 * proceso murió sin liberar) y puede recuperarse automáticamente.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

function rutaLock(nombre) {
  return path.join(cfg.LOCKS_DIR, nombre + '.lock');
}

function leerLock(nombre) {
  try {
    return JSON.parse(fs.readFileSync(rutaLock(nombre), 'utf8'));
  } catch (e) {
    return null;
  }
}

function esHuerfano(lock) {
  return !lock || (Date.now() - lock.creadoEn) > cfg.LOCK_STALE_MS;
}

/** Intenta adquirir el bloqueo. Devuelve { ok, motivo }. */
function adquirir(nombre, titular) {
  fs.mkdirSync(cfg.LOCKS_DIR, { recursive: true });
  const existente = leerLock(nombre);
  if (existente && !esHuerfano(existente)) {
    return { ok: false, motivo: 'Ya hay una operación en curso ("' + existente.titular + '", iniciada hace menos de ' + Math.round(cfg.LOCK_STALE_MS / 60000) + ' min). Espera a que termine.' };
  }
  const datos = { titular, creadoEn: Date.now(), pid: process.pid };
  fs.writeFileSync(rutaLock(nombre), JSON.stringify(datos));
  return { ok: true };
}

function liberar(nombre) {
  try { fs.unlinkSync(rutaLock(nombre)); } catch (e) { /* ya no existía */ }
}

/** Ejecuta fn() con el bloqueo adquirido y lo libera siempre al terminar (éxito o error). */
async function conBloqueo(nombre, titular, fn) {
  const resultado = adquirir(nombre, titular);
  if (!resultado.ok) return { ok: false, motivo: resultado.motivo };
  try {
    const valor = await fn();
    return { ok: true, valor };
  } finally {
    liberar(nombre);
  }
}

module.exports = { adquirir, liberar, conBloqueo, leerLock, esHuerfano };
