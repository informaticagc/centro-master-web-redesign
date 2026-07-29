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
const { renderFichaHTML } = require('../../scripts/build-fichas');

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

console.log('\n' + pasadas + ' comprobaciones superadas.');
