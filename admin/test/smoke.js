#!/usr/bin/env node
/**
 * Pruebas de humo del panel administrativo. No requiere el servidor
 * arrancado ni un framework de test — solo comprueba, en modo lectura,
 * que los servicios base funcionan y que los datos reales validan.
 * No modifica web/data/cursos.json ni ningún fichero público.
 */
'use strict';
const assert = require('assert');
const { slugify, esSlugValido, slugUnico } = require('../services/slug');
const { verificarPassword } = require('../services/auth');
const { runValidator } = require('../services/validator');
const publish = require('../services/publish');
const model = require('../services/curso-model');

let pasadas = 0;
function ok(desc) { pasadas++; console.log('  ✓ ' + desc); }

// --- slug ---
assert.strictEqual(slugify('Inserción laboral de personas con discapacidad'), 'insercion-laboral-de-personas-con-discapacidad');
ok('slugify() elimina acentos y normaliza');
assert.ok(esSlugValido('curso-de-prueba'));
assert.ok(!esSlugValido('Curso Con Espacios'));
ok('esSlugValido() valida formato');
assert.strictEqual(slugUnico('mi curso', [{ id: 'a', slug: 'mi-curso' }], null), 'mi-curso-2');
ok('slugUnico() evita colisiones');

// --- auth ---
const crypto = require('crypto');
const salt = crypto.randomBytes(16).toString('hex');
const hash = 'scrypt:' + salt + ':' + crypto.scryptSync('clave-de-prueba', salt, 64).toString('hex');
assert.ok(verificarPassword('clave-de-prueba', hash));
assert.ok(!verificarPassword('clave-incorrecta', hash));
ok('verificarPassword() acepta la correcta y rechaza la incorrecta');

// --- curso-model ---
const plantilla = model.plantillaVacia();
assert.strictEqual(plantilla.estado, 'borrador');
assert.ok(/^curso-[a-f0-9]{8}$/.test(plantilla.id));
ok('plantillaVacia() genera id y estado por defecto correctos');

const original = Object.assign(plantilla, { nombre: 'Curso original', slug: 'curso-original', estado: 'finalizado', inscripcionAbierta: true, fechaInicio: '2026-01-01', plazasDisponibles: 10 });
const copia = model.duplicar(original, [original]);
assert.notStrictEqual(copia.id, original.id);
assert.strictEqual(copia.estado, 'borrador');
assert.strictEqual(copia.inscripcionAbierta, false);
assert.strictEqual(copia.fechaInicio, null);
ok('duplicar() limpia estado/inscripción/fechas y genera id nuevo');

const { propuesta, camposARevisar } = model.nuevaConvocatoria(original, [original]);
assert.strictEqual(propuesta.estado, 'borrador');
assert.strictEqual(propuesta.plazasDisponibles, null);
assert.ok(camposARevisar.includes('fechaInicio'));
ok('nuevaConvocatoria() propone borrador limpio con campos a revisar');

// --- publish: solo funciones puras, sin tocar git real ---
assert.ok(publish.esArchivoPermitido('web/data/cursos.json'));
assert.ok(publish.esArchivoPermitido('web/cursos/mi-curso/index.html'));
assert.ok(publish.esArchivoPermitido('web/assets/nueva-imagen.webp'));
assert.ok(!publish.esArchivoPermitido('admin/data/historial/operaciones.jsonl'));
assert.ok(!publish.esArchivoPermitido('design/Home.dc.html'));
ok('esArchivoPermitido() acepta solo rutas del catálogo público');

// --- validador real sobre los datos reales (solo lectura) ---
const v = runValidator();
assert.strictEqual(v.errores.length, 0, 'validate-data.js no debería reportar errores sobre los datos actuales');
ok('scripts/validate-data.js (real) pasa sin errores sobre los datos actuales');

console.log('\n' + pasadas + ' comprobaciones superadas.');
