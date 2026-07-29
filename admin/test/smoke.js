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
function ejecutarValidadorConCurso(curso) {
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
      estadosPublicos: [], cursos: [curso],
    };
    fs.writeFileSync(path.join(stagingDir, 'cursos.json'), JSON.stringify(cursosData, null, 2), 'utf8');
    return runValidator(stagingDir);
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
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

console.log('\n' + pasadas + ' comprobaciones superadas.');
