/**
 * cursos-store.js
 *
 * Única puerta de escritura de web/data/cursos.json desde el panel. Fuente
 * única: no crea ninguna base de datos ni JSON paralelo. Reglas de negocio
 * (qué es válido) viven en scripts/validate-data.js, ejecutado como
 * subproceso — este módulo no reimplementa esas reglas, solo garantiza que
 * la escritura en disco sea segura (backup + atómica + rollback).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const { runValidator } = require('./validator');
const { serializar } = require('./json-formato');

function leerCursosData() {
  const raw = fs.readFileSync(cfg.CURSOS_JSON, 'utf8');
  return JSON.parse(raw);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Guarda cursosData de forma segura:
 *   1. Valida forma mínima en memoria (objeto con array .cursos).
 *   2. Escribe una copia "staged" completa de /web/data/ en un directorio
 *      temporal y ejecuta el validador real (scripts/validate-data.js)
 *      contra esa copia — nunca contra el archivo real todavía.
 *   3. Si el validador reporta errores bloqueantes: no se toca
 *      cursos.json real. Se devuelven errores/avisos al llamador.
 *   4. Si es válido: se hace backup del cursos.json real actual, se
 *      escribe el nuevo contenido en un fichero temporal en el MISMO
 *      directorio (web/data/) y se renombra de forma atómica sobre
 *      cursos.json.
 *   5. Verificación final: se relee y se re-parsea el fichero ya
 *      reemplazado; si algo fuera mal (disco, permisos...), se restaura el
 *      backup automáticamente.
 *
 * Devuelve { ok, errores, avisos, backupPath }.
 */
function guardarCursosData(cursosData) {
  if (!cursosData || !Array.isArray(cursosData.cursos)) {
    return { ok: false, errores: ['Estructura interna inválida: falta el array "cursos".'], avisos: [] };
  }

  const nuevoContenido = serializar(cursosData) + '\n';

  // --- 2. Validación sobre una copia staged, sin tocar el archivo real ---
  fs.mkdirSync(cfg.TMP_DIR, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(cfg.TMP_DIR, 'staging-'));
  try {
    const archivosData = fs.readdirSync(cfg.DATA_DIR);
    archivosData.forEach((nombre) => {
      const origen = path.join(cfg.DATA_DIR, nombre);
      if (fs.statSync(origen).isFile()) {
        fs.copyFileSync(origen, path.join(stagingDir, nombre));
      }
    });
    fs.writeFileSync(path.join(stagingDir, 'cursos.json'), nuevoContenido, 'utf8');

    const resultado = runValidator(stagingDir);
    if (!resultado.ok) {
      return { ok: false, errores: resultado.errores, avisos: resultado.avisos };
    }

    // --- 4. Backup + escritura atómica sobre el archivo real ---
    fs.mkdirSync(cfg.BACKUPS_DIR, { recursive: true });
    const backupPath = path.join(cfg.BACKUPS_DIR, 'cursos.' + timestamp() + '.json');
    fs.copyFileSync(cfg.CURSOS_JSON, backupPath);

    const tmpFile = cfg.CURSOS_JSON + '.tmp';
    fs.writeFileSync(tmpFile, nuevoContenido, 'utf8');
    // Confirma que lo escrito es JSON válido antes de reemplazar.
    JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    fs.renameSync(tmpFile, cfg.CURSOS_JSON); // atómico dentro del mismo volumen

    // --- 5. Verificación final con posibilidad de rollback ---
    try {
      JSON.parse(fs.readFileSync(cfg.CURSOS_JSON, 'utf8'));
    } catch (e) {
      fs.copyFileSync(backupPath, cfg.CURSOS_JSON);
      return { ok: false, errores: ['Fallo al escribir cursos.json; se restauró la copia de seguridad automáticamente.'], avisos: [] };
    }

    return { ok: true, errores: [], avisos: resultado.avisos, backupPath };
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

module.exports = { leerCursosData, guardarCursosData };
