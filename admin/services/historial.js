/**
 * historial.js — registro administrativo independiente del JSON público.
 * No añade campos internos a los cursos publicados; vive por completo en
 * admin/data/historial/, fuera de Git (ver .gitignore).
 *
 * Formato: JSON Lines (una operación por línea) — robusto ante escritura
 * concurrente/parcial: una línea corrupta al final no invalida las
 * anteriores, y el append es una operación de bajo nivel simple y segura.
 * Nunca se registran contraseñas, secretos, cookies ni el _csrf.
 */
'use strict';
const fs = require('fs');
const cfg = require('../config');

function registrar(entry) {
  fs.mkdirSync(cfg.HISTORIAL_DIR, { recursive: true });
  const linea = {
    fecha: new Date().toISOString(),
    usuario: entry.usuario || null,
    operacion: entry.operacion,
    cursoId: entry.cursoId || null,
    nombre: entry.nombre || null,
    slug: entry.slug || null,
    estadoAnterior: entry.estadoAnterior || null,
    estadoPosterior: entry.estadoPosterior || null,
    camposModificados: entry.camposModificados || null,
    resultado: entry.resultado || null,
    mensajeError: entry.mensajeError || null,
  };
  fs.appendFileSync(cfg.HISTORIAL_FILE, JSON.stringify(linea) + '\n', 'utf8');
}

/** Lee las entradas más recientes primero, con filtros opcionales simples. */
function leer(filtros) {
  filtros = filtros || {};
  let raw;
  try {
    raw = fs.readFileSync(cfg.HISTORIAL_FILE, 'utf8');
  } catch (e) {
    return [];
  }
  let entradas = raw.split('\n').filter(Boolean).map((linea) => {
    try { return JSON.parse(linea); } catch (e) { return null; }
  }).filter(Boolean);

  if (filtros.operacion) entradas = entradas.filter((e) => e.operacion === filtros.operacion);
  if (filtros.cursoId) entradas = entradas.filter((e) => e.cursoId === filtros.cursoId);
  if (filtros.q) {
    const q = filtros.q.toLowerCase();
    entradas = entradas.filter((e) => (e.nombre || '').toLowerCase().includes(q) || (e.slug || '').toLowerCase().includes(q));
  }
  return entradas.reverse();
}

function camposModificados(anterior, nuevo) {
  if (!anterior) return null;
  const campos = [];
  Object.keys(nuevo).forEach((k) => {
    if (JSON.stringify(anterior[k]) !== JSON.stringify(nuevo[k])) campos.push(k);
  });
  return campos;
}

module.exports = { registrar, leer, camposModificados };
