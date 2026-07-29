#!/usr/bin/env node
/**
 * Pruebas de humo del panel administrativo. No requiere el servidor
 * arrancado ni un framework de test — solo comprueba, en modo lectura,
 * que los servicios base funcionan y que los datos reales validan.
 * No modifica web/data/cursos.json ni ningún fichero público.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { slugify, esSlugValido, slugUnico } = require('../services/slug');
const { verificarPassword } = require('../services/auth');
const { runValidator } = require('../services/validator');
const publish = require('../services/publish');
const model = require('../services/curso-model');
const escape = require('../../scripts/lib/escape');
const { renderFichaHTML, __test: buildFichasTest } = require('../../scripts/build-fichas');
const { safeInternalHref, safeHttpsURL, safeHttpURL } = buildFichasTest;
const editorialRules = require('../../scripts/lib/editorial-rules');
const editorial = require('../services/editorial');
const ejs = require('ejs');
const cfg = require('../config');

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

// --- scripts/validate-data.js (Fase V1): validaciones estructurales nuevas ---
// runValidator() se ejecuta contra una copia "staged" de web/data/ con un
// cursos.json de prueba (nunca se toca el real), igual que ya hace
// admin/services/cursos-store.js antes de escribir en disco.
function cursoDePruebaValidacion(overrides) {
  return Object.assign({
    id: 'curso-test-validacion', codigo: null, slug: 'curso-test-validacion',
    nombre: 'Curso de prueba', descripcionCorta: 'Descripción corta de prueba.', descripcionCompleta: null,
    imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: null, alt: 'foto', objectPosition: null },
    familiaProfesional: null, situacionDestinataria: [], isla: 'Gran Canaria', municipio: null, sedeId: null,
    modalidad: 'presencial', tipoPrecio: 'gratuito', precio: null, requisitos: [], nivel: null, certificacion: null,
    tipoFormacion: null, duracionHoras: null, duracionTexto: null, fechaInicio: null,
    fechaInicioAproximada: null, fechaFin: null, horario: null, ayudasBecas: null,
    documentacionNecesaria: [], plazasDisponibles: null, inscripcionAbierta: false, urlInscripcion: null,
    modulosUnidadesFormativas: [], prioridadColectivos: [], estado: 'borrador', destacado: null,
    orden: null, urlFicha: null, palabrasClave: [],
  }, overrides);
}
function ejecutarValidadorConCursos(cursosArray) {
  const dataDirReal = path.join(__dirname, '..', '..', 'web', 'data');
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cem-validate-test-'));
  try {
    fs.readdirSync(dataDirReal).forEach((nombre) => {
      const origen = path.join(dataDirReal, nombre);
      if (fs.statSync(origen).isFile()) fs.copyFileSync(origen, path.join(stagingDir, nombre));
    });
    const cursosData = {
      version: '1.2', actualizado: '2026-01-01', notas: '',
      estadosPermitidos: ['borrador', 'proximamente', 'matricula-abierta', 'ultimas-plazas', 'en-curso', 'finalizado', 'archivado'],
      estadosPublicos: [], cursos: cursosArray,
    };
    fs.writeFileSync(path.join(stagingDir, 'cursos.json'), JSON.stringify(cursosData, null, 2), 'utf8');
    return runValidator(stagingDir);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}
function ejecutarValidadorConCurso(curso) {
  return ejecutarValidadorConCursos([curso]);
}

// Caso base: la fixture de prueba, sin modificar, debe validar sin errores
// (confirma que el resto de los casos falla por la condición probada, no
// por un fallo accidental de la fixture).
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({})).errores.length, 0, 'la fixture base de prueba debería validar sin errores');
ok('validate-data.js: la fixture base de prueba (sin modificar) valida sin errores');

// --- Campos de texto obligatorios: isla, modalidad, tipoPrecio ---
['isla', 'modalidad', 'tipoPrecio'].forEach(function (campo) {
  [null, '', '   '].forEach(function (valorInvalido) {
    const overrides = {};
    overrides[campo] = valorInvalido;
    const r = ejecutarValidadorConCurso(cursoDePruebaValidacion(overrides));
    assert.ok(r.errores.length > 0, campo + ' = ' + JSON.stringify(valorInvalido) + ' debería producir un error');
  });
});
ok('validate-data.js rechaza isla/modalidad/tipoPrecio ausentes, vacíos o solo espacios');

// --- Campos de texto obligatorios ya existentes (id, slug, nombre, estado):
// se refuerza con trim() para que un valor de solo espacios también cuente
// como ausente, reutilizando el mismo mensaje de error ya existente. ---
['id', 'slug', 'nombre', 'estado'].forEach(function (campo) {
  [null, '', '   '].forEach(function (valorInvalido) {
    const overrides = {};
    overrides[campo] = valorInvalido;
    const r = ejecutarValidadorConCurso(cursoDePruebaValidacion(overrides));
    assert.ok(r.errores.length > 0, campo + ' = ' + JSON.stringify(valorInvalido) + ' debería producir un error');
  });
});
ok('validate-data.js rechaza id/slug/nombre/estado ausentes, vacíos o solo espacios (trim reforzado)');

// --- Enums: modalidad, tipoPrecio ---
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ modalidad: 'teleformacion' })).errores.length, 0, 'modalidad "teleformacion" es válida');
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ tipoPrecio: 'privado' })).errores.length, 0, 'tipoPrecio "privado" es válido');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ modalidad: 'online' })).errores.length > 0, 'modalidad "online" no está en el enum y debe rechazarse');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ tipoPrecio: 'subvencionado' })).errores.length > 0, 'tipoPrecio "subvencionado" no está en el enum y debe rechazarse');
ok('validate-data.js acepta los valores reales del enum de modalidad/tipoPrecio y rechaza valores fuera de él');

// --- Arrays: elementos deben ser texto (vacío/espacios permitidos; número,
// booleano u objeto no) ---
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ requisitos: ['ESO'] })).errores.length, 0, '["ESO"] debe aceptarse');
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ requisitos: ['', ' ', 'ESO'] })).errores.length, 0, '["", " ", "ESO"] debe aceptarse en esta fase (limpieza editorial queda para otra fase)');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ requisitos: [123] })).errores.length > 0, '[123] debe rechazarse');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ requisitos: [true] })).errores.length > 0, '[true] debe rechazarse');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ requisitos: [{}] })).errores.length > 0, '[{}] debe rechazarse');
ok('validate-data.js acepta elementos de texto (incluso vacíos) y rechaza número/booleano/objeto como elemento de array');

// prioridadColectivos recibe la misma validación mínima de tipo que el
// resto de arrays de texto (array + elementos string), aunque siga sin
// consumidor ni semántica de negocio decidida — solo tipo, sin enum, sin
// duplicados, sin avisos, sin obligatoriedad.
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ prioridadColectivos: ['ESO'] })).errores.length, 0, 'prioridadColectivos: ["ESO"] debe aceptarse');
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ prioridadColectivos: ['', ' ', 'ESO'] })).errores.length, 0, 'prioridadColectivos: ["", " ", "ESO"] debe aceptarse (misma política editorial que el resto)');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ prioridadColectivos: [123] })).errores.length > 0, 'prioridadColectivos: [123] debe rechazarse');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ prioridadColectivos: [true] })).errores.length > 0, 'prioridadColectivos: [true] debe rechazarse');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ prioridadColectivos: [{}] })).errores.length > 0, 'prioridadColectivos: [{}] debe rechazarse');
ok('validate-data.js aplica a prioridadColectivos la misma validación mínima de tipo que al resto de arrays de texto');

// Un array de texto explícitamente null se acepta (distinto de un valor que
// no es un array en absoluto): "si existe y no es null, debe ser un array".
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ requisitos: null })).errores.length, 0, 'requisitos: null debe aceptarse, no es lo mismo que "no es un array"');
ok('validate-data.js acepta null en un array de texto (distinto de un valor no-array)');

// --- Números: duracionHoras, plazasDisponibles, orden ---
['duracionHoras', 'plazasDisponibles', 'orden'].forEach(function (campo) {
  [0, 1, 25, 999].forEach(function (valorValido) {
    const overrides = {};
    overrides[campo] = valorValido;
    const r = ejecutarValidadorConCurso(cursoDePruebaValidacion(overrides));
    assert.strictEqual(r.errores.length, 0, campo + ' = ' + valorValido + ' debería aceptarse');
  });
  [-1, '10'].forEach(function (valorInvalido) {
    const overrides = {};
    overrides[campo] = valorInvalido;
    const r = ejecutarValidadorConCurso(cursoDePruebaValidacion(overrides));
    assert.ok(r.errores.length > 0, campo + ' = ' + JSON.stringify(valorInvalido) + ' debería rechazarse');
  });
});
ok('validate-data.js acepta 0/1/25/999 y rechaza -1 y "10" (string) en duracionHoras/plazasDisponibles/orden');

// NaN e Infinity no se pueden probar como JSON.stringify(NaN/Infinity) real
// porque JSON no tiene forma de representarlos (se convierten en null antes
// de tocar el validador). Se prueba en su lugar que un cursos.json con el
// token literal NaN (JSON inválido) ya es rechazado por el parseo — el caso
// real "un número no finito llega al validador" es estructuralmente
// imposible a través de un JSON.parse válido; esNumeroEstructuralmenteValido()
// lo cubre igualmente por si algún día cursos.json deja de ser JSON estricto.
(function () {
  const dataDirReal = path.join(__dirname, '..', '..', 'web', 'data');
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cem-validate-test-'));
  try {
    fs.readdirSync(dataDirReal).forEach(function (nombre) {
      const origen = path.join(dataDirReal, nombre);
      if (fs.statSync(origen).isFile()) fs.copyFileSync(origen, path.join(stagingDir, nombre));
    });
    const cursoJson = JSON.stringify({ version: '1.2', actualizado: '2026-01-01', notas: '', estadosPermitidos: [], estadosPublicos: [], cursos: [cursoDePruebaValidacion({})] }, null, 2);
    const conNaN = cursoJson.replace('"duracionHoras": null', '"duracionHoras": NaN');
    fs.writeFileSync(path.join(stagingDir, 'cursos.json'), conNaN, 'utf8');
    const r = runValidator(stagingDir);
    assert.ok(r.errores.length > 0, 'un cursos.json con el token NaN (JSON inválido) debe rechazarse');
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
})();
ok('validate-data.js rechaza un cursos.json con NaN/Infinity literal (JSON inválido, no representable de otra forma)');

// --- Booleanos: inscripcionAbierta, destacado ---
['inscripcionAbierta', 'destacado'].forEach(function (campo) {
  [true, false].forEach(function (valorValido) {
    const overrides = {};
    overrides[campo] = valorValido;
    const r = ejecutarValidadorConCurso(cursoDePruebaValidacion(overrides));
    assert.strictEqual(r.errores.length, 0, campo + ' = ' + valorValido + ' debería aceptarse');
  });
  ['true', 'false', 1, 0].forEach(function (valorInvalido) {
    const overrides = {};
    overrides[campo] = valorInvalido;
    const r = ejecutarValidadorConCurso(cursoDePruebaValidacion(overrides));
    assert.ok(r.errores.length > 0, campo + ' = ' + JSON.stringify(valorInvalido) + ' debería rechazarse');
  });
});
ok('validate-data.js acepta true/false y rechaza "true"/"false"/1/0 en inscripcionAbierta/destacado');

// --- Fase V2: nivel (aviso, no error) ---
[null, 'nivel-1', 'nivel-2', 'nivel-3'].forEach(function (valorValido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ nivel: valorValido }));
  assert.strictEqual(r.errores.length, 0, 'nivel = ' + JSON.stringify(valorValido) + ' no debería producir error');
  assert.strictEqual(r.avisos.some(function (a) { return a.indexOf('nivel') !== -1 && a.indexOf('no está en el enum') !== -1; }), false, 'nivel = ' + JSON.stringify(valorValido) + ' no debería producir aviso de enum');
});
['nivel-4', 'avanzado'].forEach(function (valorInvalido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ nivel: valorInvalido }));
  assert.strictEqual(r.errores.length, 0, 'nivel = "' + valorInvalido + '" no debería producir error');
  assert.ok(r.avisos.some(function (a) { return a.indexOf('nivel "' + valorInvalido + '"') !== -1; }), 'nivel = "' + valorInvalido + '" debería producir un aviso');
});
ok('validate-data.js: nivel desconocido produce aviso (nunca error); null y los tres valores reales no producen aviso');

// --- Fase V2: situacionDestinataria (aviso semántico, no error) ---
[[], ['desempleado'], ['ocupado'], ['desempleado', 'ocupado']].forEach(function (valorValido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ situacionDestinataria: valorValido }));
  assert.strictEqual(r.errores.length, 0, JSON.stringify(valorValido) + ' no debería producir error');
  assert.strictEqual(r.avisos.some(function (a) { return a.indexOf('situacionDestinataria contiene un valor no reconocido') !== -1; }), false, JSON.stringify(valorValido) + ' no debería producir aviso semántico');
});
[['autonomo'], ['desempleado', 'estudiante']].forEach(function (valorInvalido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ situacionDestinataria: valorInvalido }));
  assert.strictEqual(r.errores.length, 0, JSON.stringify(valorInvalido) + ' no debería producir error');
  assert.ok(r.avisos.some(function (a) { return a.indexOf('situacionDestinataria contiene un valor no reconocido') !== -1; }), JSON.stringify(valorInvalido) + ' debería producir un aviso');
});
// La validación estructural ya existente (tipo de elemento) sigue siendo error.
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ situacionDestinataria: [123] })).errores.length > 0, 'situacionDestinataria: [123] sigue siendo error estructural');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ situacionDestinataria: [true] })).errores.length > 0, 'situacionDestinataria: [true] sigue siendo error estructural');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ situacionDestinataria: [{}] })).errores.length > 0, 'situacionDestinataria: [{}] sigue siendo error estructural');
ok('validate-data.js: situacionDestinataria con valor semántico desconocido produce aviso; el chequeo estructural de tipo sigue siendo error');

// --- Fase V2: coherencia fechaInicio/fechaFin (aviso, no error) ---
[
  { fechaInicio: '2026-01-01', fechaFin: '2026-06-01' },
  { fechaInicio: '2026-01-01', fechaFin: '2026-01-01' },
  { fechaInicio: '2026-01-01', fechaFin: null },
  { fechaInicio: null, fechaFin: '2026-06-01' },
  { fechaInicio: null, fechaFin: null },
].forEach(function (overrides) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion(overrides));
  assert.strictEqual(r.errores.length, 0, JSON.stringify(overrides) + ' no debería producir error');
  assert.strictEqual(r.avisos.some(function (a) { return a.indexOf('es posterior a') !== -1; }), false, JSON.stringify(overrides) + ' no debería producir aviso de orden de fechas');
});
const rFechasInvertidas = ejecutarValidadorConCurso(cursoDePruebaValidacion({ fechaInicio: '2026-06-01', fechaFin: '2026-01-01' }));
assert.strictEqual(rFechasInvertidas.errores.length, 0, 'fechaInicio > fechaFin no debería producir error');
assert.ok(rFechasInvertidas.avisos.some(function (a) { return a.indexOf('es posterior a') !== -1; }), 'fechaInicio > fechaFin debería producir un aviso');
// Si una fecha ya es inválida, no se añade además el aviso de orden invertido.
const rFechaInvalida = ejecutarValidadorConCurso(cursoDePruebaValidacion({ fechaInicio: '2026-13-99', fechaFin: '2026-01-01' }));
assert.ok(rFechaInvalida.errores.length > 0, 'una fecha inválida sigue siendo error');
assert.strictEqual(rFechaInvalida.avisos.some(function (a) { return a.indexOf('es posterior a') !== -1; }), false, 'no debe añadirse el aviso de orden si una fecha ya es inválida');
ok('validate-data.js: fechaInicio posterior a fechaFin produce aviso; nunca si alguna fecha falta o ya es inválida');

// --- Fase V2: nombre duplicado (aviso, un único aviso por grupo) ---
const rNombresDiferentes = ejecutarValidadorConCursos([
  cursoDePruebaValidacion({ id: 'curso-a', slug: 'curso-a', nombre: 'Curso de Ofimática' }),
  cursoDePruebaValidacion({ id: 'curso-b', slug: 'curso-b', nombre: 'Curso de Socorrismo' }),
]);
assert.strictEqual(rNombresDiferentes.errores.length, 0, 'nombres diferentes no deberían producir error');
assert.strictEqual(rNombresDiferentes.avisos.some(function (a) { return a.indexOf('nombre duplicado') !== -1; }), false, 'nombres diferentes no deberían producir aviso de nombre duplicado');

const rNombresDuplicados = ejecutarValidadorConCursos([
  cursoDePruebaValidacion({ id: 'curso-a', slug: 'curso-a', nombre: 'Curso de Ofimática' }),
  cursoDePruebaValidacion({ id: 'curso-b', slug: 'curso-b', nombre: 'curso de ofimática' }),
  cursoDePruebaValidacion({ id: 'curso-c', slug: 'curso-c', nombre: '  Curso de Ofimática  ' }),
]);
assert.strictEqual(rNombresDuplicados.errores.length, 0, 'un nombre duplicado nunca debe producir error');
const avisosDuplicado = rNombresDuplicados.avisos.filter(function (a) { return a.indexOf('nombre duplicado') !== -1; });
assert.strictEqual(avisosDuplicado.length, 1, 'debe producirse exactamente un único aviso por grupo de nombres duplicados, no uno por curso');
assert.ok(avisosDuplicado[0].indexOf('curso-a') !== -1 && avisosDuplicado[0].indexOf('curso-b') !== -1 && avisosDuplicado[0].indexOf('curso-c') !== -1, 'el aviso debe indicar los identificadores de los cursos implicados');
ok('validate-data.js: nombre duplicado (trim + minúsculas) produce un único aviso indicando los ids implicados, nunca error');

// --- Fase V3: urlInscripcion (política de URL en la entrada, siempre error, nunca aviso) ---
[
  null, 'https://example.com/inscripcion', 'http://example.com/inscripcion',
  '/inscripcion', './inscripcion', '../inscripcion',
  'inscripcion.html', 'formularios/inscripcion.html',
].forEach(function (valorValido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ urlInscripcion: valorValido }));
  assert.strictEqual(r.errores.length, 0, 'urlInscripcion = ' + JSON.stringify(valorValido) + ' debería aceptarse');
});
const BACKSLASH3 = String.fromCharCode(92);
[
  '', '   ', 'javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test',
  'mailto:info@example.com', 'tel:123456789', '//example.com/path',
  BACKSLASH3 + BACKSLASH3 + 'server' + BACKSLASH3 + 'share', 'C:' + BACKSLASH3 + 'temp' + BACKSLASH3 + 'file',
  '#section', '?curso=1',
].forEach(function (valorInvalido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ urlInscripcion: valorInvalido }));
  assert.ok(r.errores.length > 0, 'urlInscripcion = ' + JSON.stringify(valorInvalido) + ' debería rechazarse con error');
  assert.strictEqual(r.avisos.some(function (a) { return a.indexOf('urlInscripcion') !== -1; }), false, 'urlInscripcion = ' + JSON.stringify(valorInvalido) + ' no debe producir un aviso (debe ser error)');
});
ok('validate-data.js: urlInscripcion aplica la política de safeHttpOrRelativeURL() en la entrada, siempre como error');

// --- Fase V3: imagen.src (política de URL + existencia local segura) ---
// Las URLs externas (http/https) solo se comprueban por política, nunca
// contra el disco — se verifica con un valor que no existe realmente.
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'https://example.com/curso.webp', srcset: null, alt: 'x', objectPosition: null } })).errores.length, 0, 'imagen.src con URL externa https no debe comprobar el disco');
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'http://example.com/curso.webp', srcset: null, alt: 'x', objectPosition: null } })).errores.length, 0, 'imagen.src con URL externa http no debe comprobar el disco');
[
  'javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test',
  'mailto:info@example.com', 'tel:123456789', '//example.com/path',
  BACKSLASH3 + BACKSLASH3 + 'server' + BACKSLASH3 + 'share', 'C:' + BACKSLASH3 + 'temp' + BACKSLASH3 + 'file',
  '#section', '?curso=1',
].forEach(function (valorInvalido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: valorInvalido, srcset: null, alt: 'x', objectPosition: null } }));
  assert.ok(r.errores.length > 0, 'imagen.src = ' + JSON.stringify(valorInvalido) + ' debería rechazarse con error');
});
ok('validate-data.js: imagen.src aplica la política de URL en la entrada (acepta http/https/relativo, rechaza esquemas peligrosos)');

// Ruta local existente → válida (0 errores); ruta local inexistente → error.
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: null, alt: 'x', objectPosition: null } })).errores.length, 0, 'imagen.src con una ruta local existente debe aceptarse');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/no-existe-de-verdad-999.webp', srcset: null, alt: 'x', objectPosition: null } })).errores.length > 0, 'imagen.src con una ruta local inexistente debe producir error');
// Ruta que escapa del directorio web/ (../ un nivel por encima de web/):
// debe ser error aunque la política de URL la acepte sintácticamente.
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: '../fuera-de-web.webp', srcset: null, alt: 'x', objectPosition: null } })).errores.length > 0, 'imagen.src que resuelve fuera de web/ debe producir error');
ok('validate-data.js: imagen.src distingue recurso local (comprueba disco, sin escapar de web/) de URL externa (nunca comprueba disco)');

// El valor almacenado en imagen.src se interpreta relativo a la raíz
// pública web/ (no relativo al propio documento de la ficha, que vive dos
// niveles más abajo, en web/cursos/{slug}/index.html — build-fichas.js
// antepone su propio "../../" para compensar esa profundidad). Por tanto
// "../assets/x.webp" y "../../assets/x.webp" no son solo "sintácticamente
// arriesgados": aplicados a un fichero real, generan en la ficha un src
// que el navegador resuelve FUERA de web/ (comprobado con
// renderFichaHTML() + resolución relativa: "../assets/x.webp" en
// cursos.json → "../../../assets/x.webp" en el HTML → se resuelve, desde
// web/cursos/{slug}/, a una ruta un nivel por encima de web/ — imagen
// rota). Se rechazan por tanto ambas condiciones a la vez: escapan de
// web/ Y producirían una imagen rota. "assets/x.webp", "./assets/x.webp"
// y "/assets/x.webp" sí resuelven correctamente dentro de web/.
(function () {
  const real = 'assets/curso-socorrismo-1200.webp';
  const variantes = {
    'assets/curso-socorrismo-1200.webp': true,
    './assets/curso-socorrismo-1200.webp': true,
    '../assets/curso-socorrismo-1200.webp': false,
    '../../assets/curso-socorrismo-1200.webp': false,
    '/assets/curso-socorrismo-1200.webp': true,
  };
  Object.keys(variantes).forEach(function (valor) {
    const debeAceptarse = variantes[valor];
    const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: valor, srcset: null, alt: 'x', objectPosition: null } }));
    if (debeAceptarse) {
      assert.strictEqual(r.errores.length, 0, 'imagen.src = ' + JSON.stringify(valor) + ' (recurso real existente) debería aceptarse');
    } else {
      assert.ok(r.errores.length > 0, 'imagen.src = ' + JSON.stringify(valor) + ' debería rechazarse por resolver fuera de web/');
    }
  });
})();
ok('validate-data.js: de las 5 variantes de ruta documentadas, solo assets/x.webp, ./assets/x.webp y /assets/x.webp resuelven dentro de web/ — ../ y ../../ se rechazan por producir una imagen rota en la ficha real');

// --- Fase V3: imagen.srcset (validación estricta: todo el campo es
// inválido si cualquier candidato lo es; comprobación de recursos locales) ---
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'assets/curso-socorrismo-1200.webp 480w, assets/curso-ofimatica-1200.webp 960w', alt: 'x', objectPosition: null } })).errores.length, 0, 'srcset con descriptores "w" y ficheros locales reales debe aceptarse');
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'assets/curso-socorrismo-1200.webp 1x, assets/curso-ofimatica-1200.webp 2x', alt: 'x', objectPosition: null } })).errores.length, 0, 'srcset con descriptores "x" y ficheros locales reales debe aceptarse');
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'https://example.com/a.webp 1x, https://example.com/b.webp 2x', alt: 'x', objectPosition: null } })).errores.length, 0, 'srcset con URLs externas debe aceptarse sin comprobar disco');

[
  'assets/a.webp', 'assets/a.webp 0w', 'assets/a.webp 1.5x', 'assets/a.webp 480h',
  'assets/a.webp 480w extra', 'javascript:alert(1) 1x', 'data:image/svg+xml,test 1x',
].forEach(function (srcsetInvalido) {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: srcsetInvalido, alt: 'x', objectPosition: null } }));
  assert.ok(r.errores.length > 0, 'srcset = ' + JSON.stringify(srcsetInvalido) + ' debería rechazarse con error');
});
ok('validate-data.js: imagen.srcset rechaza candidatos sin descriptor, con descriptor inválido, con más de dos componentes o con esquema peligroso');

// Candidato local inexistente y candidato que escapa de web/ dentro de srcset.
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'assets/no-existe-de-verdad-999.webp 1x', alt: 'x', objectPosition: null } })).errores.length > 0, 'srcset con un candidato local inexistente debe producir error');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: '../fuera-de-web.webp 1x', alt: 'x', objectPosition: null } })).errores.length > 0, 'srcset con un candidato que escapa de web/ debe producir error');
// Combinación de candidato válido e inválido: el campo entero es inválido.
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'assets/curso-socorrismo-1200.webp 1x, javascript:alert(1) 2x', alt: 'x', objectPosition: null } })).errores.length > 0, 'srcset con un candidato válido y otro inválido debe rechazar el campo entero');
// Campo completamente vacío.
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: '', alt: 'x', objectPosition: null } })).errores.length > 0, 'srcset vacío (cadena "") debe producir error');
// Espacios alrededor de candidatos válidos: deben seguir aceptándose.
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: '  assets/curso-socorrismo-1200.webp 1x ,  assets/curso-ofimatica-1200.webp 2x  ', alt: 'x', objectPosition: null } })).errores.length, 0, 'espacios alrededor de candidatos válidos no deben afectar la validación');
// Espacios múltiples y tabulación entre la URL y el descriptor dentro de
// un mismo candidato (no solo alrededor de la coma): el separador se
// parte con /\s+/, así que ambos deben seguir aceptándose.
const TAB = String.fromCharCode(9);
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'assets/curso-socorrismo-1200.webp    480w', alt: 'x', objectPosition: null } })).errores.length, 0, 'múltiples espacios entre URL y descriptor deben aceptarse');
assert.strictEqual(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'assets/curso-socorrismo-1200.webp' + TAB + '480w', alt: 'x', objectPosition: null } })).errores.length, 0, 'una tabulación entre URL y descriptor debe aceptarse');
assert.ok(ejecutarValidadorConCurso(cursoDePruebaValidacion({ imagen: { src: 'assets/curso-socorrismo-1200.webp', srcset: 'assets/curso-socorrismo-1200.webp 480w extra', alt: 'x', objectPosition: null } })).errores.length > 0, 'un tercer token ("extra") sigue rechazando el candidato');
ok('validate-data.js: imagen.srcset comprueba recursos locales (existencia y que no escapen de web/), rechaza mezclas válido/inválido, campo vacío, y tolera espacios');

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

// --- renderFichaHTML(): texto visible escapado en la ficha real generada ---
// Curso de prueba SOLO en memoria — nunca se escribe en web/data/cursos.json
// ni en disco. sedesById={} y publicCourses=[] porque el estado elegido
// (matricula-abierta) no activa la ruta de "cursos similares".
const cursoConCaracteresProblematicos = {
  id: 'curso-test-escape', slug: 'curso-test-escape',
  nombre: 'Curso <Especial> & "Seguro"',
  descripcionCorta: "O'Reilly",
  descripcionCompleta: '<script>alert(1)</script>',
  imagen: { src: null, srcset: null, alt: null, objectPosition: null },
  situacionDestinataria: [], isla: 'Gran Canaria "especial"', municipio: null, sedeId: null,
  modalidad: 'presencial', tipoPrecio: 'gratuito', precio: null,
  requisitos: ['<script>alert(1)</script>', "O'Reilly"],
  nivel: null, certificacion: null, tipoFormacion: 'Curso <Especial> & "Seguro"',
  duracionHoras: null, duracionTexto: null,
  fechaInicio: null, fechaInicioAproximada: null, fechaFin: null,
  horario: null, ayudasBecas: null,
  documentacionNecesaria: [], plazasDisponibles: null,
  inscripcionAbierta: false, urlInscripcion: null,
  modulosUnidadesFormativas: [], estado: 'matricula-abierta',
};
const htmlGenerado = renderFichaHTML(cursoConCaracteresProblematicos, {}, []);

assert.ok(htmlGenerado.indexOf('<script>alert(1)</script>') === -1, 'no debe aparecer el <script> inyectado sin escapar');
assert.ok(htmlGenerado.indexOf('&lt;script&gt;alert(1)&lt;/script&gt;') !== -1, 'el <script> inyectado debe aparecer escapado');
ok('renderFichaHTML() no introduce ninguna etiqueta <script> a partir de datos de curso');

assert.ok(htmlGenerado.indexOf('Curso &lt;Especial&gt; &amp; &quot;Seguro&quot;') !== -1, 'el nombre del curso debe aparecer escapado en el HTML');
const h1Match = /<h1>([\s\S]*?)<\/h1>/.exec(htmlGenerado);
assert.ok(h1Match, 'debe existir un <h1> en el HTML generado');
assert.strictEqual(h1Match[1], 'Curso &lt;Especial&gt; &amp; &quot;Seguro&quot;', 'el <h1> debe contener el nombre del curso ya escapado, sin HTML crudo');
// Nota: <title>/<meta>/breadcrumb siguen mostrando el nombre sin escapar
// en esta etapa a propósito — quedan fuera de alcance (ver informe).
ok('renderFichaHTML() escapa curso.nombre en el <h1> y en las tarjetas donde se reutiliza como texto');

assert.ok(htmlGenerado.indexOf('O&#39;Reilly') !== -1, 'la comilla simple debe aparecer escapada');
ok('renderFichaHTML() escapa comillas simples en descripcionCorta/requisitos');

// El HTML estructural interno (partials, iconos SVG, header/footer) debe
// seguir intacto: solo debe haber los <script> legítimos del propio
// documento (el de help-widget.js y el del menú móvil), ninguno más.
const totalScriptTags = (htmlGenerado.match(/<script/g) || []).length;
assert.strictEqual(totalScriptTags, 2, 'solo deben existir los 2 <script> legítimos de la plantilla (help-widget.js y el del menú móvil)');
assert.ok(htmlGenerado.indexOf('<div class="wrap">') !== -1, 'el contenedor raíz de la plantilla debe seguir intacto');
assert.ok(htmlGenerado.indexOf('<div class="course-hero">') !== -1, 'la estructura del hero debe seguir intacta');
assert.ok(htmlGenerado.indexOf('<h1>') !== -1, 'el <h1> estructural debe seguir presente');
assert.ok(htmlGenerado.indexOf('<header>') !== -1 && htmlGenerado.indexOf('<footer>') !== -1, 'header y footer (partials.js) deben seguir intactos');
ok('renderFichaHTML() mantiene intacto el HTML estructural interno (partials, hero, iconos)');

// Sin doble escape: un "&" que ya fue escapado a "&amp;" no debe volver a
// escaparse a "&amp;amp;".
assert.ok(htmlGenerado.indexOf('&amp;amp;') === -1, 'no debe producirse doble escape de &');
assert.ok(htmlGenerado.indexOf('&amp;lt;') === -1, 'no debe producirse doble escape de <');
ok('renderFichaHTML() no aplica doble escape');

// --- renderFichaHTML(): atributos HTML escapados en la ficha real generada ---
// Curso de prueba SOLO en memoria — nunca se escribe en disco. imagen.src
// apunta a una ruta ficticia (no necesita existir: renderFichaHTML no
// accede al disco para las imágenes, solo concatena texto).
const cursoConAtributosProblematicos = {
  id: 'curso-test-attr', slug: 'curso-test-attr',
  nombre: 'Curso "Especial" & <Seguro>',
  descripcionCorta: 'Curso "seguro" & <útil>',
  descripcionCompleta: null,
  imagen: {
    src: 'assets/curso-test.webp', srcset: null,
    alt: 'Imagen "especial" <curso>',
    objectPosition: '50% 40%;" onload="alert(1)',
  },
  situacionDestinataria: [], isla: 'Gran Canaria', municipio: null, sedeId: null,
  modalidad: 'presencial', tipoPrecio: 'gratuito', precio: null, requisitos: [],
  nivel: null, certificacion: null, tipoFormacion: null, duracionHoras: null, duracionTexto: null,
  fechaInicio: null, fechaInicioAproximada: null, fechaFin: null, horario: null, ayudasBecas: null,
  documentacionNecesaria: [], plazasDisponibles: null, inscripcionAbierta: false, urlInscripcion: null,
  modulosUnidadesFormativas: [], estado: 'matricula-abierta',
};
const htmlAtributos = renderFichaHTML(cursoConAtributosProblematicos, {}, []);

// alt no puede cerrar el atributo ni inyectar uno nuevo.
assert.ok(htmlAtributos.indexOf('alt="Imagen &quot;especial&quot; &lt;curso&gt;"') !== -1, 'el alt de la imagen del hero debe aparecer escapado');
assert.ok(htmlAtributos.indexOf('alt="Imagen "especial"') === -1, 'el alt no debe romper el atributo con comillas sin escapar');
ok('renderFichaHTML() escapa el atributo alt de la imagen del hero');

// El valor malicioso de objectPosition no debe crear un atributo onload real:
// debe quedar contenido, escapado, dentro del propio atributo style (con
// &quot; en vez de comillas reales) y no debe existir en ningún punto del
// HTML la secuencia con comilla real que cerraría el atributo de verdad.
assert.ok(htmlAtributos.indexOf('style="object-position:50% 40%;&quot; onload=&quot;alert(1);"') !== -1, 'object-position debe quedar contenido dentro del propio atributo style, escapado');
assert.ok(htmlAtributos.indexOf(';" onload="alert(1)') === -1, 'no debe aparecer una comilla real que cierre el atributo style seguida de un onload real');
ok('renderFichaHTML() neutraliza el intento de inyección de onload vía object-position');

// content de las metaetiquetas escapado (&, <, > convertidos a entidades,
// comillas sin romper el atributo).
assert.ok(htmlAtributos.indexOf('<meta name="description" content="Curso &quot;seguro&quot; &amp; &lt;útil&gt;. Formación') !== -1 || htmlAtributos.indexOf('name="description" content="Curso &quot;seguro&quot; &amp; &lt;útil&gt;') !== -1, 'meta description debe quedar escapada');
assert.ok(htmlAtributos.indexOf('property="og:title" content="Curso &quot;Especial&quot; &amp; &lt;Seguro&gt; — Centro de Estudios Máster"') !== -1, 'og:title debe quedar escapado, incluyendo el sufijo del centro');
ok('renderFichaHTML() escapa el content de las metaetiquetas (description, og:title, og:description)');

// El HTML estructural sigue siendo válido tras aplicar attr().
assert.ok(htmlAtributos.indexOf('<div class="wrap">') !== -1, 'el contenedor raíz debe seguir intacto');
assert.ok(htmlAtributos.indexOf('<header>') !== -1 && htmlAtributos.indexOf('<footer>') !== -1, 'header y footer deben seguir intactos');
ok('renderFichaHTML() mantiene el HTML estructural válido tras escapar atributos');

// Sin doble escape en los atributos.
assert.ok(htmlAtributos.indexOf('&amp;quot;') === -1, 'no debe producirse doble escape de comillas en atributos');
assert.ok(htmlAtributos.indexOf('&amp;amp;') === -1, 'no debe producirse doble escape de & en atributos');
ok('renderFichaHTML() no aplica doble escape en atributos');

// Los atributos URL permanecen sin cambios en esta etapa: el src de la
// imagen se inserta tal cual (sin attr()) y el href de WhatsApp sigue
// codificado con encodeURIComponent (URL-encoding), no con entidades HTML.
assert.ok(htmlAtributos.indexOf('src="../../assets/curso-test.webp"') !== -1, 'el src de la imagen debe insertarse sin attr() en esta etapa');
assert.ok(htmlAtributos.indexOf('href="https://wa.me/34682821956?text=Hola%2C%20quiero%20informaci%C3%B3n') !== -1, 'el href de WhatsApp debe seguir usando encodeURIComponent, no attr()/entidades HTML');
ok('renderFichaHTML() deja los atributos URL (src, href) sin tocar en esta etapa');

// --- safeInternalHref() (__test): fichaHrefDesdeFicha() SIEMPRE devuelve
// algo que empieza por "../" (ver scripts/lib/format.js), así que el caso
// de un enlace interno absoluto es imposible de provocar con datos reales
// a través de renderFichaHTML() — se prueba directamente vía __test. ---
assert.strictEqual(safeInternalHref('/cursos/ofimatica/'), '/cursos/ofimatica/');
assert.strictEqual(safeInternalHref('./ofimatica/'), './ofimatica/');
assert.strictEqual(safeInternalHref('../ofimatica/'), '../ofimatica/');
ok('safeInternalHref() acepta rutas que empiezan por "/", "./" o "../"');

assert.strictEqual(safeInternalHref('curso.html'), null, 'una ruta relativa ambigua sin prefijo "/", "./" ni "../" no es la forma que produce fichaHrefDesdeFicha() y debe rechazarse');
assert.strictEqual(safeInternalHref('https://example.com'), null, 'un enlace interno absoluto es un error de programación y debe rechazarse');
assert.strictEqual(safeInternalHref('http://example.com'), null);
assert.strictEqual(safeInternalHref('//example.com'), null);
assert.strictEqual(safeInternalHref('#fragmento'), null);
assert.strictEqual(safeInternalHref('?consulta=1'), null);
assert.strictEqual(safeInternalHref('mailto:info@example.com'), null);
assert.strictEqual(safeInternalHref('tel:+34928000000'), null);
ok('safeInternalHref() rechaza URLs absolutas, protocol-relative, mailto/tel, fragmento/consulta sueltos y rutas ambiguas sin prefijo');

// --- safeHttpsURL() (__test): whatsappCourseHref()/whatsappNextIntakeHref()
// siempre construyen https, así que su rama de rechazo es inalcanzable con
// datos reales a través de renderFichaHTML() — se prueba directamente. ---
assert.strictEqual(safeHttpsURL('https://wa.me/34682821956?text=hola'), 'https://wa.me/34682821956?text=hola');
ok('safeHttpsURL() acepta una URL absoluta https');

assert.strictEqual(safeHttpsURL('http://wa.me/34682821956'), null, 'una URL de WhatsApp no-https debe rechazarse, comprobando el esquema real, no un prefijo de texto');
assert.strictEqual(safeHttpsURL('/wa.me/34682821956'), null);
assert.strictEqual(safeHttpsURL('mailto:info@example.com'), null);
assert.strictEqual(safeHttpsURL('tel:+34928000000'), null);
assert.strictEqual(safeHttpsURL('#fragmento'), null);
assert.strictEqual(safeHttpsURL('?consulta=1'), null);
ok('safeHttpsURL() rechaza relativas, http, mailto, tel y fragmento/consulta sueltos');

// --- safeHttpURL() (__test): canonical/og:image, siempre null hoy porque
// SITE_BASE_URL está vacío — su rama de rechazo de rutas relativas es
// inalcanzable con datos reales a través de renderFichaHTML(). ---
assert.strictEqual(safeHttpURL('https://example.com/cursos/ofimatica/'), 'https://example.com/cursos/ofimatica/');
assert.strictEqual(safeHttpURL('http://example.com/cursos/ofimatica/'), 'http://example.com/cursos/ofimatica/');
ok('safeHttpURL() acepta URLs absolutas http o https');

assert.strictEqual(safeHttpURL('/cursos/ofimatica/'), null, 'un canonical/og:image relativo debe rechazarse aunque safeURL() lo considere válido en general (se omite la etiqueta)');
assert.strictEqual(safeHttpURL('mailto:info@example.com'), null);
assert.strictEqual(safeHttpURL('tel:+34928000000'), null);
assert.strictEqual(safeHttpURL('#fragmento'), null);
assert.strictEqual(safeHttpURL('?consulta=1'), null);
ok('safeHttpURL() rechaza rutas relativas, mailto, tel y fragmento/consulta sueltos');

// --- renderFichaHTML(): política de URLs aplicada a una ficha real ---
// Fixture base reutilizada para los casos funcionales de esta sección.
function cursoBaseURL(overrides) {
  return Object.assign({
    id: 'curso-test-url', slug: 'curso-test-url', nombre: 'Curso de prueba de URLs',
    descripcionCorta: null, descripcionCompleta: null,
    imagen: { src: null, srcset: null, alt: null, objectPosition: null },
    situacionDestinataria: [], isla: 'Gran Canaria', municipio: null, sedeId: null,
    modalidad: 'presencial', tipoPrecio: 'gratuito', precio: null, requisitos: [],
    nivel: null, certificacion: null, tipoFormacion: null, duracionHoras: null, duracionTexto: null,
    fechaInicio: null, fechaInicioAproximada: null, fechaFin: null, horario: null, ayudasBecas: null,
    documentacionNecesaria: [], plazasDisponibles: null, inscripcionAbierta: false, urlInscripcion: null,
    modulosUnidadesFormativas: [], estado: 'matricula-abierta',
  }, overrides);
}

// Imagen del hero con esquema peligroso (mailto:): no debe generarse <img>,
// ni un src="" vacío, en el bloque .hero-photo.
const htmlImgInvalido = renderFichaHTML(cursoBaseURL({ imagen: { src: 'mailto:info@example.com', srcset: null, alt: 'foto', objectPosition: null } }), {}, []);
assert.ok(htmlImgInvalido.indexOf('<div class="hero-photo">\n<img') === -1, 'no debe insertarse <img> inmediatamente tras abrir .hero-photo si la URL es insegura');
assert.ok(htmlImgInvalido.indexOf('src=""') === -1, 'nunca debe generarse un src="" vacío');
assert.ok(htmlImgInvalido.indexOf('mailto:info@example.com') === -1, 'la URL mailto: rechazada no debe aparecer en ningún atributo de la imagen');
ok('renderFichaHTML() omite la imagen del hero cuando imagen.src usa un esquema no permitido (mailto:)');

// Imagen del hero con ruta relativa válida: sí debe aparecer, con el
// prefijo "../../" y escapada con attr().
const htmlImgValido = renderFichaHTML(cursoBaseURL({ imagen: { src: 'assets/curso-valido.webp', srcset: null, alt: 'foto válida', objectPosition: null } }), {}, []);
assert.ok(htmlImgValido.indexOf('src="../../assets/curso-valido.webp"') !== -1, 'una imagen con ruta relativa válida debe insertarse con el prefijo ../../');
ok('renderFichaHTML() inserta la imagen del hero cuando imagen.src es una ruta relativa válida');

// srcset: estructura "url descriptor, url descriptor". Se prueba a través
// de renderFichaHTML() (no de safeSrcset() directamente, ya no exportada)
// inspeccionando el atributo srcset del <img> del hero.
function heroImg(html) {
  const m = /<img [^>]*sizes="\(max-width:1180px\)[^>]*>/.exec(html);
  return m ? m[0] : '';
}
function imagenFixture(srcset) {
  return cursoBaseURL({ imagen: { src: 'assets/a.webp', srcset: srcset, alt: 'a', objectPosition: null } });
}

const htmlSrcsetValido = renderFichaHTML(imagenFixture('assets/a.webp 1x, assets/a@2x.webp 2x'), {}, []);
assert.ok(heroImg(htmlSrcsetValido).indexOf('srcset="../../assets/a.webp 1x, ../../assets/a@2x.webp 2x"') !== -1, 'un srcset con todos los candidatos válidos debe reconstruirse completo');
ok('renderFichaHTML() conserva un srcset con todos los candidatos válidos');

const htmlSrcsetMixto = renderFichaHTML(imagenFixture('assets/a.webp 1x, javascript:alert(1) 2x, assets/a@3x.webp 3x'), {}, []);
assert.ok(heroImg(htmlSrcsetMixto).indexOf('srcset="../../assets/a.webp 1x, ../../assets/a@3x.webp 3x"') !== -1, 'el candidato con esquema peligroso debe descartarse, conservando los demás');
assert.ok(htmlSrcsetMixto.indexOf('javascript:') === -1, 'la URL javascript: descartada no debe aparecer en ningún punto de la ficha');
ok('renderFichaHTML() descarta del srcset un candidato con URL inválida y conserva el resto');

const htmlSrcsetSinDescriptor = renderFichaHTML(imagenFixture('assets/a.webp'), {}, []);
assert.ok(heroImg(htmlSrcsetSinDescriptor).indexOf('srcset=') === -1, 'un único candidato sin descriptor debe descartarse entero, sin generar srcset=""');
ok('renderFichaHTML() descarta un candidato de srcset sin descriptor');

const htmlSrcsetDecimal = renderFichaHTML(imagenFixture('assets/a.webp 1.5x'), {}, []);
assert.ok(heroImg(htmlSrcsetDecimal).indexOf('srcset=') === -1, 'una densidad decimal (1.5x) no está permitida por la política restringida actual');
ok('renderFichaHTML() descarta un candidato de srcset con densidad decimal (1.5x)');

const htmlSrcsetTresComponentes = renderFichaHTML(imagenFixture('assets/a.webp 1x texto-extra'), {}, []);
assert.ok(heroImg(htmlSrcsetTresComponentes).indexOf('srcset=') === -1, 'un candidato con más de dos componentes separados por espacio debe descartarse entero');
ok('renderFichaHTML() descarta un candidato de srcset con más de dos componentes');

const htmlSrcsetVacio = renderFichaHTML(imagenFixture(null), {}, []);
assert.ok(heroImg(htmlSrcsetVacio).indexOf('srcset=') === -1, 'sin srcset en los datos no debe generarse el atributo');
ok('renderFichaHTML() no genera srcset cuando imagen.srcset es null');

// curso.urlInscripcion insegura: se omite TODA la CTA de inscripción (ni
// href="" ni href="#"), sin dejar el botón "Solicitar plaza" muerto.
const htmlInscripcionInsegura = renderFichaHTML(cursoBaseURL({ urlInscripcion: 'javascript:alert(1)' }), {}, []);
assert.ok(htmlInscripcionInsegura.indexOf('Solicitar plaza') === -1, 'con una urlInscripcion insegura no debe aparecer el botón "Solicitar plaza"');
assert.ok(htmlInscripcionInsegura.indexOf('href=""') === -1, 'nunca debe aparecer un href="" vacío en toda la ficha');
assert.ok(htmlInscripcionInsegura.indexOf('class="cta-solid"') === -1, 'no debe generarse ningún enlace con la clase cta-solid cuando urlInscripcion es insegura');
assert.ok(htmlInscripcionInsegura.indexOf('javascript:') === -1, 'la URL javascript: rechazada no debe aparecer en ningún punto de la ficha');
ok('renderFichaHTML() omite toda la CTA de inscripción cuando urlInscripcion es insegura, sin generar href="" ni href="#"');

// curso.urlInscripcion válida con "&" en la consulta: debe insertarse
// correctamente escapada (&amp;), nunca cruda ni doble-escapada.
const htmlInscripcionConAmpersand = renderFichaHTML(cursoBaseURL({ urlInscripcion: 'https://example.com/inscripcion?curso=ofimatica&turno=manana' }), {}, []);
assert.ok(htmlInscripcionConAmpersand.indexOf('href="https://example.com/inscripcion?curso=ofimatica&amp;turno=manana"') !== -1, 'el "&" de la URL de inscripción debe quedar escapado como &amp;');
assert.ok(htmlInscripcionConAmpersand.indexOf('&amp;amp;') === -1, 'no debe producirse doble escape del "&" en la URL de inscripción');
ok('renderFichaHTML() escapa correctamente un "&" presente en la query de urlInscripcion');

// curso.urlInscripcion como ruta relativa editorial sin prefijo (mismo
// formato que usan hoy imagen.src/srcset en web/data/cursos.json): debe
// aceptarse igual que "assets/imagen.webp", ya que safeHttpOrRelativeURL()
// no exige el prefijo estricto de safeInternalHref().
const htmlInscripcionRelativa = renderFichaHTML(cursoBaseURL({ urlInscripcion: 'inscripcion.html' }), {}, []);
assert.ok(htmlInscripcionRelativa.indexOf('href="inscripcion.html"') !== -1, 'una urlInscripcion relativa sin prefijo (formato editorial) debe aceptarse');
ok('renderFichaHTML() acepta una urlInscripcion relativa sin prefijo, como "inscripcion.html"');

// Ninguna URL insegura (javascript:, data:, file:) debe aparecer en ningún
// atributo de la ficha, en ninguno de los casos anteriores.
[htmlImgInvalido, htmlInscripcionInsegura].forEach(function (html) {
  assert.ok(html.indexOf('javascript:') === -1, 'no debe aparecer javascript: en ningún atributo');
  assert.ok(html.indexOf('data:') === -1, 'no debe aparecer data: en ningún atributo');
  assert.ok(html.indexOf('file:') === -1, 'no debe aparecer file: en ningún atributo');
});
ok('renderFichaHTML() no deja rastro de esquemas javascript:, data: ni file: en ningún atributo URL');

// --- Fase V4B: motor editorial unificado (scripts/lib/editorial-rules.js) ---

// Regresión: admin/services/editorial.js sigue devolviendo exactamente los
// mismos avisos {campo, mensaje} que antes de la extracción — mismo curso
// de referencia usado ya en esta sesión para verificar el comportamiento.
const cursoSinNada = {
  nombre: 'x', imagen: {}, estado: 'borrador',
  descripcionCorta: null, descripcionCompleta: null, fechaInicio: null, fechaInicioAproximada: null,
  horario: null, requisitos: [], certificacion: null, familiaProfesional: null, palabrasClave: [],
  sedeId: null, municipio: null, inscripcionAbierta: false, urlInscripcion: null,
};
const avisosEditorial = editorial.revisarCurso(cursoSinNada);
assert.strictEqual(avisosEditorial.length, 8, 'revisarCurso() debe seguir devolviendo 8 avisos para un curso sin nada informado');
assert.deepStrictEqual(avisosEditorial.map(function (a) { return a.campo; }), ['descripcionCorta', 'fechaInicio', 'horario', 'requisitos', 'certificacion', 'familiaProfesional', 'palabrasClave', 'municipio'], 'revisarCurso() debe seguir devolviendo los mismos campos en el mismo orden');
assert.strictEqual(editorial.revisarCurso(Object.assign({}, cursoSinNada, { descripcionCorta: 'x', fechaInicio: '2026-01-01', horario: 'x', requisitos: ['x'], certificacion: 'x', familiaProfesional: 'x', palabrasClave: ['x'], municipio: 'x' })).length, 0, 'revisarCurso() no debe avisar de nada cuando todo está informado');
assert.strictEqual(editorial.resumenEditorial([cursoSinNada]).length, 1, 'resumenEditorial() debe incluir cursos con avisos');
assert.strictEqual(editorial.resumenEditorial([Object.assign({}, cursoSinNada, { descripcionCorta: 'x', fechaInicio: '2026-01-01', horario: 'x', requisitos: ['x'], certificacion: 'x', familiaProfesional: 'x', palabrasClave: ['x'], municipio: 'x' })]).length, 0, 'resumenEditorial() debe excluir cursos sin avisos');
ok('admin/services/editorial.js: revisarCurso()/resumenEditorial() se comportan exactamente igual tras extraerse a scripts/lib/editorial-rules.js');

// --- evaluarRecomendaciones(): SEO_KEYWORDS_SPARSE ---
function conPalabrasClave(palabrasClave) {
  return { nombre: 'Curso de prueba', imagen: { alt: 'foto descriptiva' }, palabrasClave: palabrasClave, descripcionCorta: null, descripcionCompleta: null };
}
[[], ['unica']].forEach(function (pk) {
  const recs = editorialRules.evaluarRecomendaciones(conPalabrasClave(pk));
  assert.ok(recs.some(function (r) { return r.codigo === 'SEO_KEYWORDS_SPARSE'; }), 'palabrasClave = ' + JSON.stringify(pk) + ' debería generar SEO_KEYWORDS_SPARSE');
});
[['a', 'b'], ['a', 'b', 'c', 'd', 'e']].forEach(function (pk) {
  const recs = editorialRules.evaluarRecomendaciones(conPalabrasClave(pk));
  assert.ok(!recs.some(function (r) { return r.codigo === 'SEO_KEYWORDS_SPARSE'; }), 'palabrasClave = ' + JSON.stringify(pk) + ' NO debería generar SEO_KEYWORDS_SPARSE');
});
ok('evaluarRecomendaciones(): SEO_KEYWORDS_SPARSE se activa con 0 o 1 palabra clave y no con 2 o más');

// --- evaluarRecomendaciones(): IMAGE_ALT_IDENTICAL_TO_NAME ---
function conAltYNombre(alt, nombre) {
  return { nombre: nombre, imagen: { alt: alt }, palabrasClave: ['a', 'b'], descripcionCorta: null, descripcionCompleta: null };
}
assert.ok(editorialRules.evaluarRecomendaciones(conAltYNombre('Curso de ofimática', 'Curso de ofimática')).some(function (r) { return r.codigo === 'IMAGE_ALT_IDENTICAL_TO_NAME'; }), 'alt idéntico al nombre debe generar IMAGE_ALT_IDENTICAL_TO_NAME');
assert.ok(!editorialRules.evaluarRecomendaciones(conAltYNombre('Foto de alumnado en el aula', 'Curso de ofimática')).some(function (r) { return r.codigo === 'IMAGE_ALT_IDENTICAL_TO_NAME'; }), 'alt distinto del nombre no debe generar la recomendación');
assert.ok(editorialRules.evaluarRecomendaciones(conAltYNombre('  Curso de ofimática  ', 'Curso de ofimática')).some(function (r) { return r.codigo === 'IMAGE_ALT_IDENTICAL_TO_NAME'; }), 'espacios exteriores no deben impedir la igualdad tras trim()');
assert.ok(!editorialRules.evaluarRecomendaciones(conAltYNombre('curso de ofimática', 'Curso de ofimática')).some(function (r) { return r.codigo === 'IMAGE_ALT_IDENTICAL_TO_NAME'; }), 'la comparación es sensible a mayúsculas/minúsculas (solo trim, sin normalizar mayúsculas)');
// Los 3 casos documentados expresamente en el encargo (política aprobada:
// trim(alt) === trim(nombre), sensible a mayúsculas — sin cambiar a
// comparación insensible en esta fase).
assert.ok(editorialRules.evaluarRecomendaciones(conAltYNombre('Curso de ofimática', 'Curso de ofimática')).some(function (r) { return r.codigo === 'IMAGE_ALT_IDENTICAL_TO_NAME'; }), 'caso documentado 1: "Curso de ofimática" vs "Curso de ofimática" -> recomendación');
assert.ok(editorialRules.evaluarRecomendaciones(conAltYNombre(' Curso de ofimática ', 'Curso de ofimática')).some(function (r) { return r.codigo === 'IMAGE_ALT_IDENTICAL_TO_NAME'; }), 'caso documentado 2: " Curso de ofimática " vs "Curso de ofimática" -> recomendación');
assert.ok(!editorialRules.evaluarRecomendaciones(conAltYNombre('CURSO DE OFIMÁTICA', 'Curso de ofimática')).some(function (r) { return r.codigo === 'IMAGE_ALT_IDENTICAL_TO_NAME'; }), 'caso documentado 3: "CURSO DE OFIMÁTICA" vs "Curso de ofimática" -> sin recomendación (sensible a mayúsculas)');
ok('evaluarRecomendaciones(): IMAGE_ALT_IDENTICAL_TO_NAME compara igualdad exacta tras trim(), sensible a mayúsculas/minúsculas');

// --- evaluarRecomendaciones(): CONTENT_DUPLICATED_TEXT ---
function conDescripciones(corta, completa) {
  return { nombre: 'x', imagen: { alt: 'foto' }, palabrasClave: ['a', 'b'], descripcionCorta: corta, descripcionCompleta: completa };
}
assert.ok(editorialRules.evaluarRecomendaciones(conDescripciones('Curso de ofimática.', 'Curso de ofimática.')).some(function (r) { return r.codigo === 'CONTENT_DUPLICATED_TEXT'; }), 'descripciones idénticas deben generar CONTENT_DUPLICATED_TEXT');
assert.ok(editorialRules.evaluarRecomendaciones(conDescripciones('Curso de ofimática.', 'Curso de ofimática. Aprenderás Word, Excel y Outlook en sesiones prácticas.')).some(function (r) { return r.codigo === 'CONTENT_DUPLICATED_TEXT'; }), 'descripcionCompleta que contiene literalmente descripcionCorta debe generar la recomendación');
assert.ok(!editorialRules.evaluarRecomendaciones(conDescripciones('Curso de ofimática.', 'Programa dirigido a personas desempleadas de Gran Canaria.')).some(function (r) { return r.codigo === 'CONTENT_DUPLICATED_TEXT'; }), 'descripciones completamente distintas no deben generar la recomendación');
assert.ok(!editorialRules.evaluarRecomendaciones(conDescripciones(null, 'Curso de ofimática.')).some(function (r) { return r.codigo === 'CONTENT_DUPLICATED_TEXT'; }), 'con descripcionCorta vacía no debe generarse la recomendación');
assert.ok(!editorialRules.evaluarRecomendaciones(conDescripciones('Curso de ofimática.', null)).some(function (r) { return r.codigo === 'CONTENT_DUPLICATED_TEXT'; }), 'con descripcionCompleta vacía no debe generarse la recomendación');
ok('evaluarRecomendaciones(): CONTENT_DUPLICATED_TEXT detecta igualdad y contención literal (trim + minúsculas), nunca con alguna descripción vacía');

// --- admin/services/validator.js: parsearSalidaValidador() (código real,
// no una réplica de su lógica) ---
const { parsearSalidaValidador } = require('../services/validator').__test;

function lineaRecomendacion(obj) { return '  ? ' + JSON.stringify(obj); }
const recomendacionValida = { codigo: 'SEO_KEYWORDS_SPARSE', ref: 'curso-ofimatica', campo: 'palabrasClave', categoria: 'seo', mensaje: 'Mensaje válido' };

// Recomendación válida.
const pUna = parsearSalidaValidador('--- x ---\n' + lineaRecomendacion(recomendacionValida) + '\nRESULTADO: OK\n');
assert.strictEqual(pUna.recomendaciones.length, 1, 'una línea de recomendación válida debe producir 1 objeto');
assert.deepStrictEqual(pUna.recomendaciones[0], recomendacionValida, 'el objeto parseado debe ser idéntico al original serializado');
assert.strictEqual(pUna.errores.length, 0, 'no debe interpretarse nada como error');
assert.strictEqual(pUna.avisos.length, 0, 'no debe interpretarse nada como aviso');
ok('parsearSalidaValidador(): una línea de recomendación válida produce un objeto idéntico al original, sin afectar a errores/avisos');

// Varias recomendaciones: dos líneas JSON distintas producen dos objetos
// independientes, conservando el orden.
const recA = Object.assign({}, recomendacionValida, { codigo: 'AAA' });
const recB = Object.assign({}, recomendacionValida, { codigo: 'BBB' });
const pVarias = parsearSalidaValidador(lineaRecomendacion(recA) + '\n' + lineaRecomendacion(recB) + '\n');
assert.deepStrictEqual(pVarias.recomendaciones.map(function (r) { return r.codigo; }), ['AAA', 'BBB'], 'dos líneas distintas deben producir dos objetos, en el mismo orden en que aparecen');
ok('parsearSalidaValidador(): varias líneas de recomendación producen objetos independientes, en el orden en que aparecen');

// Caracteres especiales en "mensaje" — construidos con JSON.stringify() en
// el propio fixture para no producir accidentalmente un JSON inválido.
const mensajeEspecial = 'Contiene : | · " \\ áéíóú ñ sin romper nada';
const recEspecial = Object.assign({}, recomendacionValida, { mensaje: mensajeEspecial });
const pEspecial = parsearSalidaValidador(lineaRecomendacion(recEspecial) + '\n');
assert.strictEqual(pEspecial.recomendaciones.length, 1, 'un mensaje con caracteres especiales sigue produciendo una recomendación');
assert.strictEqual(pEspecial.recomendaciones[0].mensaje, mensajeEspecial, 'el mensaje debe conservarse exactamente igual, incluidos ":", "|", "·", comillas, barra invertida y tildes/ñ');
ok('parsearSalidaValidador(): un mensaje con ":", "|", "·", comillas, barra invertida y tildes/ñ se conserva exactamente igual');

// JSON inválido: ignorado sin lanzar excepción.
['{', 'texto que no es JSON', '{"codigo":'].forEach(function (jsonRoto) {
  let pRoto;
  assert.doesNotThrow(function () { pRoto = parsearSalidaValidador('  ? ' + jsonRoto + '\n'); }, 'un JSON inválido ("' + jsonRoto + '") nunca debe lanzar una excepción');
  assert.strictEqual(pRoto.recomendaciones.length, 0, 'un JSON inválido ("' + jsonRoto + '") no debe añadir ninguna recomendación');
  assert.strictEqual(pRoto.errores.length, 0, 'un JSON inválido nunca se convierte en error de datos del curso');
});
ok('parsearSalidaValidador(): "{", texto sin forma de JSON y JSON truncado se ignoran sin lanzar excepción y sin convertirse en error');

// Objeto incompleto: falta una de las 5 propiedades requeridas.
['codigo', 'ref', 'campo', 'categoria', 'mensaje'].forEach(function (propAOmitir) {
  const incompleto = Object.assign({}, recomendacionValida);
  delete incompleto[propAOmitir];
  const pIncompleto = parsearSalidaValidador(lineaRecomendacion(incompleto) + '\n');
  assert.strictEqual(pIncompleto.recomendaciones.length, 0, 'un objeto sin "' + propAOmitir + '" debe ignorarse');
});
ok('parsearSalidaValidador(): un objeto al que le falta cualquiera de las 5 propiedades requeridas se ignora');

// Tipo incorrecto: codigo numérico en vez de string.
const pTipoIncorrecto = parsearSalidaValidador(lineaRecomendacion({ codigo: 123, ref: 'curso', campo: 'nombre', categoria: 'seo', mensaje: 'texto' }) + '\n');
assert.strictEqual(pTipoIncorrecto.recomendaciones.length, 0, 'codigo numérico (no string) debe ignorarse');
ok('parsearSalidaValidador(): una propiedad con tipo incorrecto (codigo numérico en vez de string) se ignora');

// Valores no-objeto.
['null', '[]', '"texto"', '123'].forEach(function (valorNoObjeto) {
  const pNoObjeto = parsearSalidaValidador('  ? ' + valorNoObjeto + '\n');
  assert.strictEqual(pNoObjeto.recomendaciones.length, 0, valorNoObjeto + ' (no es un objeto) debe ignorarse');
});
ok('parsearSalidaValidador(): valores JSON válidos pero no-objeto (null, [], "texto", 123) se ignoran');

// Línea ordinaria con un "?" en medio, pero que no empieza por "?": no debe
// interpretarse como recomendación.
const pLineaOrdinaria = parsearSalidaValidador('  Se preguntó: ¿todo bien? sí, todo correcto.\n');
assert.strictEqual(pLineaOrdinaria.recomendaciones.length, 0, 'una línea que contiene "?" en medio, pero no empieza por él, no debe interpretarse como recomendación');
ok('parsearSalidaValidador(): una línea ordinaria con "?" en medio del texto no se interpreta como recomendación');

// Seguridad: una propiedad adicional con apariencia de código no se
// ejecuta — el parser se limita a JSON.parse(). Las 5 propiedades
// obligatorias válidas ya bastan para aceptar el objeto; el contrato es
// "como mínimo estas 5 claves", no "exactamente estas 5", así que una
// propiedad extra no invalida la recomendación (ver comentario en
// esRecomendacionValida(), admin/services/validator.js).
let variableNoTocada = 'intacta';
const recConPropiedadSospechosa = Object.assign({}, recomendacionValida, {
  extra: 'require("child_process").execSync("echo pwned"); variableNoTocada = "modificada";',
});
const pSospechoso = parsearSalidaValidador(lineaRecomendacion(recConPropiedadSospechosa) + '\n');
assert.strictEqual(pSospechoso.recomendaciones.length, 1, 'una propiedad adicional válida (string) no debe invalidar la recomendación');
assert.strictEqual(typeof pSospechoso.recomendaciones[0].extra, 'string', 'la propiedad adicional debe llegar como texto plano, nunca ejecutarse');
assert.strictEqual(variableNoTocada, 'intacta', 'el contenido de la recomendación nunca debe ejecutarse: ninguna variable del entorno de prueba debe verse alterada');
ok('parsearSalidaValidador(): una propiedad adicional con apariencia de código nunca se ejecuta — el parser se limita a JSON.parse()');

// --- runValidator(): prueba integrada contra los datos reales ---
const resultadoIntegrado = runValidator();
assert.strictEqual(resultadoIntegrado.ok, true, 'runValidator() sobre los datos reales debe dar ok === true');
assert.strictEqual(resultadoIntegrado.errores.length, 0, 'runValidator() sobre los datos reales no debe reportar errores');
assert.strictEqual(resultadoIntegrado.avisos.length, 5, 'runValidator() sobre los datos reales debe reportar exactamente 5 avisos');
assert.strictEqual(resultadoIntegrado.recomendaciones.length, 1, 'runValidator() sobre los datos reales debe reportar exactamente 1 recomendación');
const recomendacionReal = resultadoIntegrado.recomendaciones[0];
assert.strictEqual(recomendacionReal.codigo, 'SEO_KEYWORDS_SPARSE');
assert.strictEqual(recomendacionReal.ref, 'curso-ofimatica');
assert.strictEqual(recomendacionReal.campo, 'palabrasClave');
assert.strictEqual(recomendacionReal.categoria, 'seo');
assert.strictEqual(typeof recomendacionReal.mensaje, 'string');
assert.ok(recomendacionReal.mensaje.length > 0, 'el mensaje real no debe estar vacío');
ok('runValidator(): prueba integrada contra los datos reales — ok/errores/avisos/recomendaciones con la estructura y cifras esperadas');

// --- scripts/validate-data.js: estadística global "campos nunca utilizados" ---
// 2 cursos: certificacion informada solo en uno (parcial, 50%), ayudasBecas
// nunca informada (0%), modalidad siempre informada (100%, ya obligatoria).
(function () {
  const cursoA = cursoDePruebaValidacion({ id: 'curso-stat-a', slug: 'curso-stat-a', certificacion: 'Certificado', ayudasBecas: null });
  const cursoB = cursoDePruebaValidacion({ id: 'curso-stat-b', slug: 'curso-stat-b', certificacion: null, ayudasBecas: null });
  const r = ejecutarValidadorConCursos([cursoA, cursoB]);
  assert.ok(/ayudasBecas\.+ 0\/2/.test(r.raw), 'ayudasBecas (0% informado) debe listarse en "Campos nunca utilizados"');
  assert.ok(!/\bcertificacion\.+ /.test(r.raw), 'certificacion (50% informado, parcial) NO debe listarse en "Campos nunca utilizados"');
  assert.ok(!/modalidad\.+ 0\/2/.test(r.raw), 'modalidad (100% informado) NO debe listarse en "Campos nunca utilizados"');
})();
ok('scripts/validate-data.js: la estadística global de campos sin uso distingue 0%, parcial y 100%, y no afecta a errores/avisos/recomendaciones');

// Campos técnicos, internos, generados o dormidos deben quedar SIEMPRE
// fuera de "Campos nunca utilizados", aunque estén al 0% (codigo,
// prioridadColectivos y precio son 0% en la fixture base por defecto).
(function () {
  const r = ejecutarValidadorConCurso(cursoDePruebaValidacion({}));
  ['codigo', 'prioridadColectivos', 'precio', 'sedeId', 'destacado', 'urlFicha'].forEach(function (campo) {
    const regexCampo = new RegExp('· ' + campo + '\\.* \\d+/\\d+');
    assert.ok(!regexCampo.test(r.raw), '"' + campo + '" es técnico/interno/dormido y nunca debe listarse en "Campos nunca utilizados", aunque esté al 0%');
  });
})();
ok('scripts/validate-data.js: la lista de campos auditables excluye explícitamente identificadores técnicos, ordenación, URLs generadas y campos dormidos');

// --- Fase V5B: agrupación de recomendaciones para la confirmación de publicación ---
const publishTest = publish.__test;

function cursoMinimo(overrides) {
  return Object.assign({ id: 'curso-x', nombre: 'Curso X' }, overrides);
}

// Categorías/campos visibles: conocidos y desconocidos.
assert.strictEqual(publishTest.categoriaVisible('seo'), 'SEO');
assert.strictEqual(publishTest.categoriaVisible('image'), 'Imagen');
assert.strictEqual(publishTest.categoriaVisible('content'), 'Contenido');
assert.strictEqual(publishTest.categoriaVisible('otra-categoria'), 'otra-categoria', 'categoría desconocida: se muestra el valor original, sin fallar');
assert.strictEqual(publishTest.categoriaVisible(null), 'General', 'categoría vacía: etiqueta genérica "General"');
assert.strictEqual(publishTest.campoVisible('palabrasClave'), 'Palabras clave');
assert.strictEqual(publishTest.campoVisible('imagen.alt'), 'Texto alternativo de la imagen');
assert.strictEqual(publishTest.campoVisible('descripcionCompleta'), 'Descripción completa');
assert.strictEqual(publishTest.campoVisible('otroCampo'), 'otroCampo', 'campo desconocido: se muestra el valor original, sin fallar');
assert.strictEqual(publishTest.campoVisible(null), 'Contenido general', 'campo vacío: etiqueta genérica "Contenido general"');
ok('publish.js: categoriaVisible()/campoVisible() traducen los valores conocidos y muestran el original (o una etiqueta genérica) para los desconocidos, sin lanzar excepción');

// Agrupación por curso: orden estable, asociación por id (no slug), curso no encontrado.
const cursosPrueba = [cursoMinimo({ id: 'curso-a', nombre: 'Curso A' }), cursoMinimo({ id: 'curso-b', nombre: 'Curso B' })];
const recomendacionesPrueba = [
  { codigo: 'SEO_KEYWORDS_SPARSE', ref: 'curso-b', campo: 'palabrasClave', categoria: 'seo', mensaje: 'Mensaje 1' },
  { codigo: 'IMAGE_ALT_IDENTICAL_TO_NAME', ref: 'curso-a', campo: 'imagen.alt', categoria: 'image', mensaje: 'Mensaje 2' },
  { codigo: 'CONTENT_DUPLICATED_TEXT', ref: 'curso-a', campo: 'descripcionCompleta', categoria: 'content', mensaje: 'Mensaje 3' },
];
const agrupadas = publishTest.agruparRecomendacionesPorElemento(recomendacionesPrueba, cursosPrueba);
assert.strictEqual(agrupadas.length, 2, 'debe haber un grupo por curso distinto referenciado, no uno por recomendación');
assert.strictEqual(agrupadas[0].id, 'curso-b', 'el orden de los grupos sigue el orden de aparición de las recomendaciones');
assert.strictEqual(agrupadas[0].nombre, 'Curso B', 'el nombre se obtiene del curso real, nunca de la recomendación');
assert.strictEqual(agrupadas[0].recomendaciones.length, 1);
assert.strictEqual(agrupadas[1].id, 'curso-a');
assert.strictEqual(agrupadas[1].recomendaciones.length, 2, 'dos recomendaciones del mismo curso.id deben agruparse juntas, en orden');
assert.strictEqual(agrupadas[1].recomendaciones[0].mensaje, 'Mensaje 2');
assert.strictEqual(agrupadas[1].recomendaciones[1].mensaje, 'Mensaje 3');
ok('publish.js: agruparRecomendacionesPorElemento() agrupa por curso.id (nunca slug), en orden estable, tomando el nombre del curso real');

// curso.slug parecido a un ref no debe confundirse con curso.id (asociación por id, nunca slug).
const cursosConSlugParecido = [{ id: 'curso-real-id', slug: 'curso-b', nombre: 'Nombre real' }];
const agrupadasPorSlug = publishTest.agruparRecomendacionesPorElemento([{ codigo: 'X', ref: 'curso-b', campo: 'x', categoria: 'seo', mensaje: 'm' }], cursosConSlugParecido);
assert.strictEqual(agrupadasPorSlug[0].id, null, 'un "ref" que coincide con el slug (no con el id) debe tratarse como curso no encontrado');
ok('publish.js: la asociación usa curso.id === recomendacion.ref con comparación estricta, nunca el slug');

// Curso no encontrado / ref "??": no lanza excepción, se agrupa sin id ni enlace.
const agrupadasSinCurso = publishTest.agruparRecomendacionesPorElemento([
  { codigo: 'X', ref: 'curso-inexistente', campo: 'x', categoria: 'seo', mensaje: 'm1' },
  { codigo: 'Y', ref: '??', campo: 'y', categoria: 'seo', mensaje: 'm2' },
], cursosPrueba);
assert.strictEqual(agrupadasSinCurso.length, 1, 'ref inexistente y "??" deben agruparse juntos bajo el mismo grupo "sin curso"');
assert.strictEqual(agrupadasSinCurso[0].id, null);
assert.strictEqual(agrupadasSinCurso[0].nombre, null);
assert.strictEqual(agrupadasSinCurso[0].recomendaciones.length, 2);
ok('publish.js: un curso no encontrado (incluido ref === "??") no lanza excepción y se agrupa sin id ni nombre');

// Sin recomendaciones: array vacío, sin fallar.
assert.deepStrictEqual(publishTest.agruparRecomendacionesPorElemento([], cursosPrueba), []);
ok('publish.js: sin recomendaciones, agruparRecomendacionesPorElemento() devuelve un array vacío');

// --- admin/views/publish-confirm.ejs: renderizado real (ejs.render, sin
// framework HTTP — el proyecto no tiene supertest ni pruebas de vista
// aisladas hoy; se usa el propio "ejs" ya instalado, sin añadir
// dependencias nuevas, compilando el fichero real con la misma resolución
// de includes que usa el servidor). ---
const vistaPublishConfirmPath = path.join(__dirname, '..', 'views', 'publish-confirm.ejs');
const vistaPublishConfirmSrc = fs.readFileSync(vistaPublishConfirmPath, 'utf8');
function planDePrueba(overrides) {
  return Object.assign({
    ok: true, problemas: [], avisos: [], editorial: [], recomendaciones: [],
    permitidos: [], desconocidos: [], mensaje: 'content: prueba', dryRun: true,
  }, overrides);
}
function renderVistaPublishConfirm(plan) {
  return ejs.render(vistaPublishConfirmSrc, { titulo: 'Publicar', cfg, plan, bloqueado: false, csrfToken: 'token-de-prueba' }, { filename: vistaPublishConfirmPath });
}

const htmlVacio = renderVistaPublishConfirm(planDePrueba({}));
assert.ok(htmlVacio.indexOf('Recomendaciones') !== -1, 'debe aparecer el título "Recomendaciones"');
assert.ok(htmlVacio.indexOf('Sin recomendaciones editoriales pendientes.') !== -1, 'estado vacío coherente cuando no hay recomendaciones');
ok('publish-confirm.ejs: aparece el título "Recomendaciones" y el estado vacío cuando no hay ninguna');

const mensajePeligroso = '<script>alert("x")</script> & < > " \' áéíóú ñ';
const gruposConDatos = publishTest.agruparRecomendacionesPorElemento(
  [{ codigo: 'SEO_KEYWORDS_SPARSE', ref: 'curso-ofimatica', campo: 'palabrasClave', categoria: 'seo', mensaje: mensajePeligroso }],
  [{ id: 'curso-ofimatica', nombre: 'Curso de Ofimática' }]
);
const htmlConDatos = renderVistaPublishConfirm(planDePrueba({ recomendaciones: gruposConDatos }));
assert.ok(htmlConDatos.indexOf('Curso de Ofimática') !== -1, 'debe aparecer el nombre del curso');
assert.ok(htmlConDatos.indexOf('/cursos/curso-ofimatica/editar') !== -1, 'debe aparecer el enlace de edición cuando el curso es conocido');
assert.ok(htmlConDatos.indexOf('SEO') !== -1 && htmlConDatos.indexOf('Palabras clave') !== -1, 'debe aparecer la categoría y el campo visibles');
assert.ok(htmlConDatos.indexOf('SEO_KEYWORDS_SPARSE') === -1, 'el código interno nunca debe mostrarse');
assert.ok(htmlConDatos.indexOf('<script>alert') === -1, 'el contenido HTML del mensaje debe escaparse, nunca renderizarse como HTML ejecutable');
assert.ok(htmlConDatos.indexOf('&lt;script&gt;') !== -1, 'el mensaje escapado debe aparecer como entidades HTML');
assert.ok(htmlConDatos.indexOf('&amp;') !== -1 && htmlConDatos.indexOf('&#34;') !== -1 && htmlConDatos.indexOf('&#39;') !== -1, 'los caracteres &, " y \' deben escaparse (EJS usa &#34; para las comillas dobles, no &quot;)');
assert.ok(htmlConDatos.indexOf('áéíóú ñ') !== -1, 'las tildes y la ñ deben conservarse intactas');
ok('publish-confirm.ejs: muestra curso/enlace/categoría/campo/mensaje, escapa HTML y caracteres especiales, y nunca muestra el código interno');

const gruposSinCurso = publishTest.agruparRecomendacionesPorElemento(
  [{ codigo: 'X', ref: '??', campo: 'x', categoria: 'seo', mensaje: 'mensaje sin curso' }], []
);
const htmlSinCurso = renderVistaPublishConfirm(planDePrueba({ recomendaciones: gruposSinCurso }));
assert.ok(htmlSinCurso.indexOf('Curso no identificado') !== -1, 'un grupo sin curso conocido debe mostrarse como "Curso no identificado"');
assert.ok(htmlSinCurso.indexOf('/cursos/null/editar') === -1, 'nunca debe construirse un enlace de edición con un identificador desconocido');
ok('publish-confirm.ejs: una recomendación sin curso identificable se muestra sin enlace de edición');

const htmlConErroresYAvisos = renderVistaPublishConfirm(planDePrueba({ ok: false, problemas: ['Problema bloqueante de prueba'], avisos: ['Aviso técnico de prueba'] }));
assert.ok(htmlConErroresYAvisos.indexOf('Problema bloqueante de prueba') !== -1, 'los problemas bloqueantes deben seguir mostrándose igual que antes');
assert.ok(htmlConErroresYAvisos.indexOf('Aviso técnico de prueba') !== -1, 'los avisos técnicos deben seguir mostrándose igual que antes');
ok('publish-confirm.ejs: errores y avisos técnicos siguen renderizándose exactamente igual que antes de esta fase');

console.log('\n' + pasadas + ' comprobaciones superadas.');
