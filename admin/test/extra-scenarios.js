/**
 * Pruebas puntuales de escenarios de la Fase 4B que no conviene disparar
 * vía clic real (fallo de push, bloqueo huérfano, publicación simultánea,
 * error de validación simulado). Se ejecuta manualmente durante el
 * desarrollo, no forma parte de npm test. No toca git real ni hace push.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const cfg = require('../config');
const lock = require('../services/lock');
const store = require('../services/cursos-store');

async function main() {
  // --- bloqueo huérfano ---
  fs.mkdirSync(cfg.LOCKS_DIR, { recursive: true });
  const lockPath = cfg.LOCKS_DIR + '/prueba.lock';
  fs.writeFileSync(lockPath, JSON.stringify({ titular: 'nadie', creadoEn: Date.now() - 10 * 60000, pid: 999999 }));
  const r1 = lock.adquirir('prueba', 'yo');
  assert.ok(r1.ok, 'un bloqueo con más de 5 minutos debe considerarse huérfano y recuperarse');
  lock.liberar('prueba');
  console.log('✓ bloqueo huérfano se recupera automáticamente');

  // --- publicación simultánea (bloqueo activo real) ---
  const r2 = lock.adquirir('prueba2', 'usuario-1');
  assert.ok(r2.ok);
  const r3 = lock.adquirir('prueba2', 'usuario-2');
  assert.ok(!r3.ok, 'una segunda adquisición mientras la primera sigue activa debe rechazarse');
  lock.liberar('prueba2');
  console.log('✓ publicación simultánea se rechaza mientras el bloqueo está activo');

  // --- error de validación (JSON corrupto temporal, restaurado después) ---
  const original = fs.readFileSync(cfg.CURSOS_JSON, 'utf8');
  try {
    fs.writeFileSync(cfg.CURSOS_JSON, '{ esto no es JSON valido');
    let lanzo = false;
    try {
      store.leerCursosData();
    } catch (e) {
      lanzo = true;
    }
    assert.ok(lanzo, 'leer un cursos.json corrupto debe lanzar, nunca devolver datos parciales');
    console.log('✓ JSON inválido detectado sin devolver datos parciales');
  } finally {
    fs.writeFileSync(cfg.CURSOS_JSON, original);
  }
  assert.strictEqual(fs.readFileSync(cfg.CURSOS_JSON, 'utf8'), original);
  console.log('✓ cursos.json restaurado exactamente tras la prueba');

  // --- fallo simulado de push (sin tocar git real) ---
  const publish = require('../services/publish');
  const git = require('../services/git-service');
  const pushOriginal = git.push;
  const addOriginal = git.add;
  const commitOriginal = git.commit;
  git.add = () => {};
  git.commit = () => {};
  git.push = () => { throw new Error('push simulado fallido (prueba, no es un fallo real de red)'); };
  try {
    const planFalso = { ok: true, dryRun: false, permitidos: ['web/data/cursos.json'], mensaje: 'content: prueba' };
    const resultado = publish.ejecutarPublicacion(planFalso);
    assert.strictEqual(resultado.ok, false);
    assert.strictEqual(resultado.commitCreado, true);
    assert.strictEqual(resultado.pushFallido, true);
    console.log('✓ fallo de push: commit local se conserva, se informa con claridad, no se deshace nada');
  } finally {
    git.push = pushOriginal;
    git.add = addOriginal;
    git.commit = commitOriginal;
  }

  console.log('\nTodos los escenarios adicionales pasaron.');
}

main().catch((e) => { console.error('FALLO:', e); process.exit(1); });
