/**
 * images.js — selección de imágenes existentes en web/assets/ y subida
 * controlada de imágenes nuevas. web/assets/ es la única carpeta destino
 * (misma que ya usa el sitio público) — no se crea ninguna carpeta paralela.
 *
 * Reglas de seguridad:
 *  - extensión restringida a IMAGE_EXTENSIONS (nunca .svg: evita SVG con
 *    <script>/onload incrustado);
 *  - tamaño máximo MAX_UPLOAD_BYTES;
 *  - nombre de fichero siempre regenerado (slug + sufijo), nunca se usa
 *    el nombre original del navegador tal cual — evita path traversal
 *    ("../../etc") y colisiones;
 *  - nunca se sobrescribe un fichero existente: si el nombre generado ya
 *    existe, se añade un sufijo numérico.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { slugify } = require('./slug');

function listarAssets() {
  return fs.readdirSync(cfg.ASSETS_DIR)
    .filter((f) => cfg.IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .sort();
}

/** Nombre de fichero seguro: sin rutas, sin caracteres especiales, extensión permitida. */
function nombreSeguro(nombreOriginal, extensionForzada) {
  const ext = (extensionForzada || path.extname(nombreOriginal || '')).toLowerCase();
  if (!cfg.IMAGE_EXTENSIONS.includes(ext)) {
    throw new Error('Extensión no permitida: ' + ext);
  }
  const base = slugify(path.basename(nombreOriginal || 'imagen', path.extname(nombreOriginal || ''))) || 'imagen';
  let candidato = base + ext;
  let n = 2;
  while (fs.existsSync(path.join(cfg.ASSETS_DIR, candidato))) {
    candidato = base + '-' + n + ext;
    n++;
  }
  // Defensa en profundidad: el nombre final nunca puede escapar de ASSETS_DIR.
  const destino = path.join(cfg.ASSETS_DIR, candidato);
  if (path.dirname(destino) !== cfg.ASSETS_DIR) {
    throw new Error('Ruta de destino inválida.');
  }
  return candidato;
}

/** Guarda el buffer subido con un nombre seguro. Devuelve el nombre final (relativo a web/assets/). */
function guardarImagenSubida(buffer, nombreOriginal) {
  if (buffer.length > cfg.MAX_UPLOAD_BYTES) {
    throw new Error('La imagen supera el tamaño máximo permitido (' + Math.round(cfg.MAX_UPLOAD_BYTES / 1024 / 1024) + ' MB).');
  }
  const nombreFinal = nombreSeguro(nombreOriginal);
  fs.writeFileSync(path.join(cfg.ASSETS_DIR, nombreFinal), buffer);
  return nombreFinal;
}

module.exports = { listarAssets, nombreSeguro, guardarImagenSubida };
