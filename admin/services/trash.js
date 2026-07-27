/**
 * trash.js — papelera lógica. Los cursos movidos aquí NO están en
 * cursos.json (no se publican, no generan ficha) pero se conservan
 * íntegros para poder restaurarlos. Vive en admin/data/trash/, fuera de
 * Git (ver .gitignore): puede contener borradores con datos aún no
 * revisados que no deben aparecer en el historial público del repositorio.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../config');

function rutaItem(id) {
  return path.join(cfg.TRASH_DIR, id + '.json');
}

function mover(curso, motivo, usuario) {
  fs.mkdirSync(cfg.TRASH_DIR, { recursive: true });
  const item = { curso, eliminadoEn: new Date().toISOString(), motivo: motivo || null, eliminadoPor: usuario || null };
  fs.writeFileSync(rutaItem(curso.id), JSON.stringify(item, null, 2), 'utf8');
}

function listar() {
  if (!fs.existsSync(cfg.TRASH_DIR)) return [];
  return fs.readdirSync(cfg.TRASH_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(cfg.TRASH_DIR, f), 'utf8')); } catch (e) { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.eliminadoEn) - new Date(a.eliminadoEn));
}

function obtener(id) {
  try {
    return JSON.parse(fs.readFileSync(rutaItem(id), 'utf8'));
  } catch (e) {
    return null;
  }
}

function eliminarDeLaPapelera(id) {
  try { fs.unlinkSync(rutaItem(id)); } catch (e) { /* ya no existía */ }
}

module.exports = { mover, listar, obtener, eliminarDeLaPapelera };
