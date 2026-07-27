/**
 * validator.js — ejecuta scripts/validate-data.js como subproceso real.
 *
 * No reimplementa ninguna regla de validación: se limita a invocar el
 * validador oficial (mismo que usa CI) y a parsear su salida de texto en
 * errores/avisos estructurados. `execFile` con argumentos fijos (nunca una
 * cadena de shell construida con datos del usuario) evita cualquier
 * inyección de comandos.
 */
'use strict';
const { execFileSync } = require('child_process');
const cfg = require('../config');

function runValidator(dataDirOverride) {
  const env = Object.assign({}, process.env);
  if (dataDirOverride) env.VALIDATE_DATA_DIR = dataDirOverride;

  let stdout = '';
  let ok = true;
  try {
    stdout = execFileSync(process.execPath, [cfg.VALIDATE_SCRIPT], { env: env, encoding: 'utf8' });
  } catch (e) {
    ok = false;
    stdout = (e.stdout || '').toString();
  }

  const errores = [];
  const avisos = [];
  stdout.split('\n').forEach((linea) => {
    const t = linea.trim();
    if (t.startsWith('✗')) errores.push(t.replace(/^✗\s*/, ''));
    else if (t.startsWith('!')) avisos.push(t.replace(/^!\s*/, ''));
  });

  return { ok: ok && errores.length === 0, errores, avisos, raw: stdout };
}

module.exports = { runValidator };
