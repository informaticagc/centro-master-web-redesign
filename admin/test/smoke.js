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
const escape = require('../../scripts/lib/escape');

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

// --- scripts/lib/escape.js: escapeHTML / text ---
assert.strictEqual(escape.text('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(escape.text('Tom & Jerry'), 'Tom &amp; Jerry');
assert.strictEqual(escape.text(`d'accord "cita"`), 'd&#39;accord &quot;cita&quot;');
ok('text()/escapeHTML() escapa &, <, >, comillas dobles y simples');

assert.strictEqual(escape.text(null), '');
assert.strictEqual(escape.text(undefined), '');
assert.strictEqual(escape.text(''), '');
assert.strictEqual(escape.text(0), '0');
assert.strictEqual(escape.text(false), 'false');
ok('text() es null-safe (null/undefined/"" -> "", sin lanzar excepción)');

// --- escapeAttribute / attr ---
assert.strictEqual(escape.attr('foo"bar'), 'foo&quot;bar');
assert.strictEqual(escape.attr("foo'bar"), 'foo&#39;bar');
assert.strictEqual(escape.attr(null), '');
assert.strictEqual(escape.attr(undefined), '');
ok('attr()/escapeAttribute() escapa comillas y es null-safe');

// --- safeURL: esquemas permitidos ---
assert.strictEqual(escape.safeURL('https://example.com/curso'), 'https://example.com/curso');
assert.strictEqual(escape.safeURL('http://example.com'), 'http://example.com');
assert.strictEqual(escape.safeURL('mailto:secretaria@centromaster.com'), 'mailto:secretaria@centromaster.com');
assert.strictEqual(escape.safeURL('tel:+34928755105'), 'tel:+34928755105');
ok('safeURL() acepta http, https, mailto y tel');

// --- safeURL: rutas relativas ---
assert.strictEqual(escape.safeURL('cursos/mi-curso/'), 'cursos/mi-curso/');
assert.strictEqual(escape.safeURL('../assets/logo.webp'), '../assets/logo.webp');
assert.strictEqual(escape.safeURL('#seccion'), '#seccion');
assert.strictEqual(escape.safeURL('?filtro=1'), '?filtro=1');
ok('safeURL() acepta rutas relativas, anclas y query sin esquema');

// --- safeURL: esquemas peligrosos rechazados ---
assert.strictEqual(escape.safeURL('javascript:alert(1)'), null);
assert.strictEqual(escape.safeURL('JavaScript:alert(1)'), null);
assert.strictEqual(escape.safeURL('data:text/html,<script>alert(1)</script>'), null);
assert.strictEqual(escape.safeURL('vbscript:msgbox(1)'), null);
assert.strictEqual(escape.safeURL('file:///etc/passwd'), null);
ok('safeURL() rechaza javascript:, data:, vbscript: y file: (lista blanca)');

// --- safeURL: bypass con caracteres de control (java\tscript:) ---
assert.strictEqual(escape.safeURL('java\tscript:alert(1)'), null);
assert.strictEqual(escape.safeURL('java\nscript:alert(1)'), null);
assert.strictEqual(escape.safeURL(' javascript:alert(1)'), null);
ok('safeURL() detecta el esquema tras quitar caracteres de control (bypass java\\tscript:)');

// --- safeURL: protocol-relative y valores vacíos ---
assert.strictEqual(escape.safeURL('//evil.example.com/x'), null);
assert.strictEqual(escape.safeURL(''), null);
assert.strictEqual(escape.safeURL('   '), null);
assert.strictEqual(escape.safeURL(null), null);
assert.strictEqual(escape.safeURL(undefined), null);
ok('safeURL() rechaza URLs protocol-relative (//host) y valores vacíos/nulos');

// --- safeURL: rutas UNC y rutas de Windows (no son rutas web válidas) ---
const BACKSLASH = String.fromCharCode(92);
assert.strictEqual(escape.safeURL(BACKSLASH + BACKSLASH + 'evil.example'), null);
assert.strictEqual(escape.safeURL('C:' + BACKSLASH + 'archivo.pdf'), null);
ok('safeURL() rechaza rutas UNC (\\\\servidor) y rutas de Windows (C:\\archivo)');

// --- safeURL: normalización de espacios exteriores ---
assert.strictEqual(escape.safeURL('  https://example.com  '), 'https://example.com');
ok('safeURL() recorta espacios exteriores en la URL devuelta');

console.log('\n' + pasadas + ' comprobaciones superadas.');
