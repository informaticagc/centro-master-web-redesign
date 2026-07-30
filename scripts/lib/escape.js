#!/usr/bin/env node
/**
 * scripts/lib/escape.js
 *
 * Escape seguro de datos dinamicos antes de interpolarlos en HTML generado
 * por concatenacion de strings (scripts/build-fichas.js y cualquier otro
 * script que construya HTML del mismo modo).
 *
 * Contexto: ninguna parte del proyecto escapaba HTML antes de este modulo
 * (auditoria previa a esta fase). Este modulo es infraestructura aislada -
 * en esta fase NO se aplica todavia a build-fichas.js ni a ningun otro
 * punto de interpolacion existente.
 *
 * API pensada para uso directo dentro de template strings:
 *
 *   `<h1>${text(curso.nombre)}</h1>`
 *   `<p>${text(curso.descripcionCorta)}</p>`
 *   `<img alt="${attr(img.alt)}">`
 *   const href = safeURL(curso.urlInscripcion);
 *   if (href) htmlParts.push('<a href="' + attr(href) + '">Solicitar plaza</a>');
 *
 * Todas las funciones son puras: no leen ni escriben en disco, no dependen
 * de estado global, no lanzan excepciones ante entradas inesperadas (null,
 * undefined, numero, booleano) - siempre devuelven un resultado seguro de
 * usar directamente, precisamente para no obligar a comprobar null/undefined
 * en cada punto de llamada.
 *
 * Sin dependencias externas.
 */
'use strict';

// ---------------------------------------------------------------------
// Nucleo: mapa de caracteres HTML especiales.
// ---------------------------------------------------------------------

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Convierte cualquier valor a la cadena que se mostraria - null/undefined
 * se convierten en cadena vacia (nunca en el texto literal "null" o
 * "undefined"), numeros y booleanos se convierten con String(). Es el
 * unico lugar del modulo que decide "que significa no tener dato".
 */
function toDisplayString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * escapeHTML(value)
 *
 * Que problema resuelve: evita que un valor dinamico (texto de admin,
 * nombre de curso, descripcion...) se interprete como marcado HTML al
 * insertarlo en el contenido de texto de un elemento (entre la apertura
 * y el cierre de una etiqueta). Escapa los 5 caracteres especiales de
 * HTML (ampersand, menor que, mayor que, comilla doble, comilla simple)
 * - el conjunto completo, no solo los signos de mayor/menor, porque una
 * comilla o un ampersand sin escapar tambien pueden romper el HTML o el
 * parseo de una entidad si el valor termina cerca de un atributo mal
 * cerrado por otro motivo.
 *
 * Cuando usarla: como pieza de bajo nivel dentro de otra funcion que
 * construye HTML y ya sabe que esta tratando con contenido de texto.
 * En el 95% de los casos de scripts/build-fichas.js, usa `text()` en su
 * lugar (mismo resultado, pero sin tener que comprobar null antes).
 *
 * Cuando NO usarla: para construir el propio marcado (nombres de
 * etiqueta, atributos fijos, SVG interno) - eso no es dato dinamico y
 * escaparlo lo romperia. Tampoco para el interior de un atributo si se
 * prefiere que la intencion quede explicita en el codigo - para eso
 * esta `escapeAttribute()`/`attr()` (hoy hacen lo mismo, pero nombrarlas
 * distinto documenta la intencion en el punto de llamada).
 */
function escapeHTML(value) {
  return toDisplayString(value).replace(/[&<>"']/g, function (ch) {
    return HTML_ENTITIES[ch];
  });
}

/**
 * escapeAttribute(value)
 *
 * Que problema resuelve: evita que un valor dinamico rompa un atributo
 * HTML (alt="...", content="...", style="...") - es decir, que el valor
 * contenga la comilla que esta delimitando el atributo y permita
 * inyectar atributos/etiquetas nuevas.
 *
 * En HTML5, escapar el mismo conjunto que `escapeHTML` (ampersand,
 * menor que, mayor que, comilla doble, comilla simple) es suficiente
 * para cualquier atributo entre comillas dobles o simples - por eso hoy
 * es un alias funcional de `escapeHTML`. Se mantiene como funcion
 * separada (en vez de reutilizar `escapeHTML` directamente en cada
 * punto de llamada) para que el codigo que la usa documente por si
 * mismo que ese valor va dentro de un atributo, no de un nodo de texto
 * - son contextos distintos aunque el escape resulte igual hoy.
 *
 * Cuando usarla: como pieza de bajo nivel; en la practica, usa `attr()`.
 *
 * Cuando NO usarla: dentro de un atributo href/src - un valor escapado
 * como atributo sigue sin ser una URL valida ni segura (por ejemplo,
 * "javascript:alert(1)" se escapa igual y sigue ejecutandose). Para eso
 * esta `safeURL()`, que valida el esquema antes de que el valor llegue
 * a `attr()`.
 */
function escapeAttribute(value) {
  return escapeHTML(value);
}

/**
 * text(value)
 *
 * Punto de entrada habitual para cualquier dato dinamico que va a
 * mostrarse como texto visible (titulo, parrafo, etiqueta de lista...).
 * Acepta null, undefined, numero, booleano o string sin que el punto de
 * llamada tenga que comprobar nada antes - siempre devuelve una cadena
 * segura de insertar directamente en el HTML, vacia si no habia dato.
 *
 * Cuando usarla: practicamente siempre que se interpola un campo de
 * curso.* (o de cualquier otro dato editorial) dentro de contenido de
 * texto. Es el alias pensado para usarse dentro de un template string,
 * como en los ejemplos de cabecera de este archivo.
 *
 * Cuando NO usarla: dentro de un atributo (usa `attr()`) ni dentro de
 * un href/src (usa `safeURL()` primero).
 */
function text(value) {
  return escapeHTML(value);
}

/**
 * attr(value)
 *
 * Igual que `text()` pero para usarse dentro de un atributo HTML.
 * Mismo comportamiento null-safe: nunca hace falta comprobar null antes
 * de llamarla.
 *
 * Cuando usarla: alt="${attr(img.alt)}", content="${attr(description)}",
 * style="object-position:${attr(img.objectPosition)};".
 *
 * Cuando NO usarla: en href/src sin pasar antes por `safeURL()` -
 * `attr()` no valida esquemas de URL, solo evita que el valor rompa la
 * sintaxis del atributo.
 */
function attr(value) {
  return escapeAttribute(value);
}

// ---------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------

// Esquemas permitidos. Deliberadamente NO incluye "javascript", "data",
// "vbscript", "file" ni ningun otro - lista blanca, no lista negra.
const ESQUEMAS_PERMITIDOS = ['http:', 'https:', 'mailto:', 'tel:'];

// Codigos de caracter de control ASCII a eliminar antes de interpretar el
// esquema de una URL: 0-31 (C0) y 127 (DEL). Se comprueba por codigo
// numerico, no con una clase de caracteres en una expresion regular con
// secuencias de escape, para que el codigo fuente sea inequivoco.
function esCaracterDeControl(codigo) {
  return codigo <= 31 || codigo === 127;
}

function quitarCaracteresDeControl(str) {
  let resultado = '';
  for (let i = 0; i < str.length; i++) {
    if (!esCaracterDeControl(str.charCodeAt(i))) resultado += str.charAt(i);
  }
  return resultado;
}

/**
 * safeURL(value)
 *
 * Que problema resuelve: evita insertar en un href/src un valor que no
 * sea una URL segura - en concreto, esquemas como "javascript:" o
 * "data:" que un navegador ejecutaria o interpretaria como contenido
 * activo en vez de como un simple enlace. Es el unico punto del
 * proyecto (tras esta fase) donde se decide que es "una URL valida".
 *
 * Devuelve la URL (recortada y sin caracteres de control) si es valida,
 * o null si no lo es. El llamador decide que hacer con null -
 * normalmente, omitir el enlace por completo, siguiendo el mismo
 * principio ya vigente en build-fichas.js de "CTA nunca muerta": mejor
 * no mostrar un boton que mostrar uno roto o peligroso.
 *
 * Valido: URLs absolutas con esquema http:, https:, mailto: o tel:; y
 * rutas relativas sin esquema (../, cursos/slug/, #ancla, ?query=1)
 * siempre que no empiecen por // (una URL "protocol-relative" como
 * //ejemplo.com equivale a una URL externa con el mismo esquema que la
 * pagina actual, y aqui se trata igual que cualquier otro esquema no
 * listado: se rechaza).
 *
 * Defensa adicional: antes de detectar el esquema, se eliminan los
 * caracteres de control ASCII (tabulador, salto de linea, retorno de
 * carro, etc.) de cualquier posicion de la cadena. Es la misma
 * normalizacion que hacen los navegadores antes de interpretar el
 * esquema de una URL, y sin ella un valor que intercale un tabulador o
 * salto de linea dentro de la palabra "javascript:" superaria una
 * comprobacion ingenua basada en comparar el principio de la cadena,
 * pero seguiria ejecutandose en el navegador real.
 *
 * Cuando usarla: cualquier valor dinamico que vaya a un href o src y no
 * este ya generado internamente por el propio codigo (un enlace fijo
 * como href="../" no necesita pasar por aqui).
 *
 * Cuando NO usarla: para escapar el resultado dentro del atributo -
 * `safeURL()` valida el esquema, no protege contra comillas dentro de
 * la URL; el resultado debe pasar tambien por `attr()` antes de
 * interpolarse, con la comprobacion de null hecha explicitamente antes
 * de decidir si se renderiza el enlace.
 */
function safeURL(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === '') return null;

  const cleaned = quitarCaracteresDeControl(str);
  if (cleaned === '') return null;

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase() + ':';
    return ESQUEMAS_PERMITIDOS.indexOf(scheme) !== -1 ? cleaned : null;
  }

  // Sin esquema: se rechaza si es "protocol-relative" (//host/...) o si
  // empieza por barra invertida (ruta UNC tipo \\servidor\recurso, o una
  // ruta de Windows tipo C:\archivo — esta ultima ya cae en la rama del
  // esquema de arriba porque "C:" se interpreta como esquema y no esta en
  // la lista blanca, pero \\servidor no tiene esquema y hay que
  // rechazarla aqui explicitamente). Ninguna de las dos es una ruta web
  // relativa valida.
  if (cleaned.indexOf('//') === 0 || cleaned.charAt(0) === '\\') return null;

  return cleaned;
}

module.exports = {
  escapeHTML: escapeHTML,
  escapeAttribute: escapeAttribute,
  safeURL: safeURL,
  text: text,
  attr: attr,
};
