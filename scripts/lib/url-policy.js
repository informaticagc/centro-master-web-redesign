#!/usr/bin/env node
/**
 * scripts/lib/url-policy.js
 *
 * Políticas de validación de URLs por destino (imágenes, srcset, enlaces
 * internos, WhatsApp, canonical/og:image). Se apoyan en safeURL()
 * (scripts/lib/escape.js), que ya filtra esquemas peligrosos (javascript:,
 * data:, vbscript:, file:...), rutas UNC/Windows y URLs protocol-relative —
 * lista blanca de esquemas permitidos (http/https/mailto/tel) o ruta
 * relativa. Las funciones de aquí añaden, sobre esa base, la política
 * concreta de cada destino: qué subconjunto de lo que safeURL() ya
 * considera "seguro" es además apropiado para ESE destino.
 *
 * Usado tanto por scripts/build-fichas.js (protección de salida: toda URL
 * aceptada se envuelve siempre en attr() en el punto de inserción, nunca se
 * inserta solo con safeURL()) como por scripts/validate-data.js (validación
 * de entrada: mismas políticas, aplicadas a los datos antes de guardarlos).
 * No mezclar con scripts/lib/escape.js, que queda limitado a escape y
 * serialización segura de atributos/texto.
 */
'use strict';

const { safeURL } = require('./escape.js');
const { esVacio } = require('./format.js');

// Extrae el esquema de una URL ya validada por safeURL() (en minúsculas,
// con los dos puntos, p.ej. "https:") o null si no tiene esquema (es decir,
// es una ruta relativa). Se usa para comprobar el esquema real en vez de
// depender de que la URL empiece por un prefijo de texto como "https://".
function extraerEsquema(url) {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  return m ? (m[1].toLowerCase() + ':') : null;
}

// Política compartida por imágenes y por la CTA de inscripción: absoluta
// http(s) o ruta relativa web. Nunca mailto:, tel:, ni una ancla/consulta
// sueltas (sin base). No es una política "de imágenes": es la política
// http-o-relativo que ambos destinos comparten hoy.
// Acepta rutas relativas sin prefijo porque los recursos del proyecto
// se almacenan también como "assets/archivo.webp".
function safeHttpOrRelativeURL(value) {
  const url = safeURL(value);
  if (!url) return null;
  const esquema = extraerEsquema(url);
  if (esquema) return (esquema === 'http:' || esquema === 'https:') ? url : null;
  if (url.charAt(0) === '#' || url.charAt(0) === '?') return null;
  return url;
}

// Imágenes (src): una inscripción no es una imagen, pero hoy comparten la
// misma política — se delega en safeHttpOrRelativeURL() en vez de duplicar
// la lógica. El día que diverjan, esta función deja de ser un alias.
function safeImageURL(value) {
  return safeHttpOrRelativeURL(value);
}

// Enlaces internos entre fichas (fichaHrefDesdeFicha): solo se aceptan
// rutas que empiecen por "/", "./" o "../" — nunca una URL absoluta (ni
// siquiera http/https) ni una ancla/consulta sueltas, ni una cadena
// relativa ambigua como "curso.html" (fichaHrefDesdeFicha() siempre
// devuelve algo que empieza por "../", ver scripts/lib/format.js). Si
// alguna vez devolviera otra cosa, es un error de programación en quien la
// llama.
function safeInternalHref(value) {
  const url = safeURL(value);
  if (!url) return null;
  if (url.charAt(0) === '/' || url.indexOf('./') === 0 || url.indexOf('../') === 0) return url;
  return null;
}

// WhatsApp (whatsappCourseHref/whatsappNextIntakeHref): siempre debe ser
// una URL absoluta https — es lo único que construyen esas funciones
// internas, pero se valida igualmente antes de insertarla, comprobando el
// esquema real (no un prefijo de texto).
function safeHttpsURL(value) {
  const url = safeURL(value);
  if (!url) return null;
  return extraerEsquema(url) === 'https:' ? url : null;
}

// Canonical y og:image: absoluta, http o https — nunca una ruta relativa,
// aunque safeURL() la considere válida en general.
function safeHttpURL(value) {
  const url = safeURL(value);
  if (!url) return null;
  const esquema = extraerEsquema(url);
  return (esquema === 'http:' || esquema === 'https:') ? url : null;
}

// Descriptor de srcset: entero positivo seguido de "w" o "x" — el único
// patrón que necesita hoy el proyecto (ver imagen.srcset en cursos.json).
// Deliberadamente no admite densidades decimales (p.ej. "1.5x") ni texto
// arbitrario; no se amplía mientras los datos reales solo usen enteros.
function esDescriptorSrcsetValido(descriptor) {
  return /^[1-9]\d*(w|x)$/.test(descriptor);
}

// srcset no es una URL suelta: es una lista "url descriptor, url
// descriptor" con sintaxis propia. Cada candidato se valida por separado
// (URL con la misma política que las imágenes, descriptor contra el
// patrón numérico de arriba) y el atributo se reconstruye solo con los
// candidatos válidos. Un candidato sin descriptor, o con más de dos
// componentes separados por espacio, se descarta entero. Si ninguno es
// válido, no se genera el atributo (nunca srcset=""). Esta es la política
// de PROTECCIÓN DE SALIDA (filtra en silencio); la validación de entrada
// (scripts/validate-data.js) es más estricta: exige que TODOS los
// candidatos sean válidos, o rechaza el campo entero.
function safeSrcset(rawSrcset) {
  if (esVacio(rawSrcset)) return null;
  const candidatos = rawSrcset.split(',').map(function (part) {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const espacio = trimmed.indexOf(' ');
    if (espacio === -1) return null; // sin descriptor: se descarta el candidato completo
    const urlBruta = trimmed.slice(0, espacio);
    const descriptor = trimmed.slice(espacio + 1).trim();
    if (!esDescriptorSrcsetValido(descriptor)) return null;
    const url = safeImageURL(urlBruta);
    if (!url) return null;
    return '../../' + url + ' ' + descriptor;
  }).filter(function (c) { return c !== null; });
  return candidatos.length ? candidatos.join(', ') : null;
}

module.exports = {
  safeHttpOrRelativeURL: safeHttpOrRelativeURL,
  safeImageURL: safeImageURL,
  safeInternalHref: safeInternalHref,
  safeHttpsURL: safeHttpsURL,
  safeHttpURL: safeHttpURL,
  safeSrcset: safeSrcset,
  esDescriptorSrcsetValido: esDescriptorSrcsetValido,
};
