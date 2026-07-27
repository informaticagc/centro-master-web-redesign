/**
 * builder.js — ejecuta scripts/build-fichas.js como subproceso real.
 * No reimplementa la generación de fichas: reutiliza el generador oficial.
 */
'use strict';
const { execFileSync } = require('child_process');
const cfg = require('../config');

function runBuildFichas() {
  try {
    const stdout = execFileSync(process.execPath, [cfg.BUILD_FICHAS_SCRIPT], { encoding: 'utf8' });
    return { ok: true, output: stdout };
  } catch (e) {
    return { ok: false, output: (e.stdout || '') + (e.stderr || '') };
  }
}

module.exports = { runBuildFichas };
