#!/usr/bin/env node
/**
 * scripts/lib/editorial-rules.js
 *
 * Motor único de reglas editoriales de calidad de contenido de un curso.
 * Dos familias de reglas, deliberadamente separadas:
 *
 *  - revisarCurso(curso): los avisos de completitud editorial que ya
 *    existían en admin/services/editorial.js (migrados aquí sin cambiar su
 *    comportamiento — mismo campo, mismo mensaje, mismas condiciones). Se
 *    siguen usando solo donde ya se usaban (pantalla de confirmación de
 *    publicación del panel admin), nunca como error ni warning de
 *    scripts/validate-data.js.
 *  - evaluarRecomendaciones(curso): RECOMMENDATION objetivas y de bajo
 *    riesgo (Fase V4B), pensadas para consumirse desde
 *    scripts/validate-data.js como una tercera colección ("recommendations"),
 *    separada de errors/warnings — nunca bloquean el guardado ni el build.
 *
 * Usado tanto por scripts/validate-data.js como por
 * admin/services/editorial.js — igual que scripts/lib/url-policy.js unificó
 * la política de URLs. scripts/ nunca depende de admin/: ESTADOS_PUBLICABLES
 * se duplica aquí a propósito (mismo patrón ya usado en
 * scripts/validate-data.js y scripts/build-fichas.js) en vez de requerir
 * admin/config.js.
 */
'use strict';

// Estados para los que scripts/build-fichas.js genera una ficha pública.
// Duplicado a propósito (ver cabecera) — no depender de admin/config.js.
const ESTADOS_PUBLICABLES = ['proximamente', 'matricula-abierta', 'ultimas-plazas', 'en-curso', 'finalizado'];

// ---------------------------------------------------------------------
// revisarCurso(): avisos de completitud editorial (migrados sin cambios de
// comportamiento desde admin/services/editorial.js). Cada uno es
// {campo, mensaje} — el mismo formato que ya consumía
// admin/views/publish-confirm.ejs.
// ---------------------------------------------------------------------
function revisarCurso(c) {
  const avisos = [];
  function add(campo, mensaje) { avisos.push({ campo, mensaje }); }

  if (!c.descripcionCorta && !c.descripcionCompleta) add('descripcionCorta', 'Sin descripción — la ficha no tendrá sección "Sobre este curso".');
  if (c.imagen && c.imagen.src && !c.imagen.alt) add('imagenAlt', 'Imagen sin texto alternativo (accesibilidad).');
  if (!c.fechaInicio && !c.fechaInicioAproximada) add('fechaInicio', 'Sin fecha de inicio, ni siquiera aproximada.');
  if (!c.horario) add('horario', 'Sin horario.');
  if (!c.requisitos || c.requisitos.length === 0) add('requisitos', 'Sin requisitos de acceso.');
  if (!c.certificacion) add('certificacion', 'Sin certificación indicada.');
  if (!c.familiaProfesional) add('familiaProfesional', 'Sin familia profesional (no se podrá filtrar por ella en el catálogo).');
  if (!c.palabrasClave || c.palabrasClave.length === 0) add('palabrasClave', 'Sin palabras clave para el buscador.');
  if (!c.sedeId && !c.municipio) add('municipio', 'Sin sede ni municipio asignado.');
  if (ESTADOS_PUBLICABLES.indexOf(c.estado) !== -1 && c.estado !== 'finalizado' && c.inscripcionAbierta && !c.urlInscripcion) {
    add('urlInscripcion', 'Curso activo sin URL de inscripción propia: la ficha usará el botón de WhatsApp.');
  }

  return avisos;
}

// ---------------------------------------------------------------------
// evaluarRecomendaciones(): RECOMMENDATION de la Fase V4B. Cada regla es
// una función pura curso -> objeto-recomendación | null. Nunca ERROR ni
// WARNING: no impiden el guardado ni la generación. Todas usan solo
// comparación objetiva (longitud, igualdad exacta tras trim/minúsculas) —
// nada de IA, similitud difusa ni análisis lingüístico.
// ---------------------------------------------------------------------

// SEO_KEYWORDS_SPARSE: menos de 2 palabras clave dificulta que el
// buscador interno encuentre el curso por sinónimos o variantes.
function reglaKeywordsSparse(curso) {
  if (!Array.isArray(curso.palabrasClave) || curso.palabrasClave.length >= 2) return null;
  return {
    codigo: 'SEO_KEYWORDS_SPARSE',
    campo: 'palabrasClave',
    categoria: 'seo',
    mensaje: 'Solo ' + curso.palabrasClave.length + ' palabra(s) clave — se recomienda añadir sinónimos o variantes para mejorar el buscador.',
  };
}

// IMAGE_ALT_IDENTICAL_TO_NAME: el alt debe describir la imagen, no
// repetir el nombre del curso — comparación de igualdad exacta tras
// trim(), sin heurística de similitud.
function reglaAltIdenticoAlNombre(curso) {
  const alt = curso.imagen && typeof curso.imagen.alt === 'string' ? curso.imagen.alt.trim() : '';
  const nombre = typeof curso.nombre === 'string' ? curso.nombre.trim() : '';
  if (!alt || !nombre || alt !== nombre) return null;
  return {
    codigo: 'IMAGE_ALT_IDENTICAL_TO_NAME',
    campo: 'imagen.alt',
    categoria: 'image',
    mensaje: 'El texto alternativo de la imagen es idéntico al nombre del curso — no aporta información adicional para accesibilidad.',
  };
}

// CONTENT_DUPLICATED_TEXT: descripcionCompleta no debería limitarse a
// repetir descripcionCorta — comparación literal (trim + minúsculas),
// nunca análisis lingüístico ni stemming.
function reglaDescripcionDuplicada(curso) {
  const corta = typeof curso.descripcionCorta === 'string' ? curso.descripcionCorta.trim() : '';
  const completa = typeof curso.descripcionCompleta === 'string' ? curso.descripcionCompleta.trim() : '';
  if (!corta || !completa) return null;
  const cortaLower = corta.toLowerCase();
  const completaLower = completa.toLowerCase();
  if (cortaLower === completaLower || completaLower.indexOf(cortaLower) !== -1) {
    return {
      codigo: 'CONTENT_DUPLICATED_TEXT',
      campo: 'descripcionCompleta',
      categoria: 'content',
      mensaje: '"descripcionCompleta" repite literalmente "descripcionCorta" — no aporta contenido adicional.',
    };
  }
  return null;
}

const REGLAS_RECOMENDACION = [reglaKeywordsSparse, reglaAltIdenticoAlNombre, reglaDescripcionDuplicada];

function evaluarRecomendaciones(curso) {
  return REGLAS_RECOMENDACION.map(function (regla) { return regla(curso); }).filter(Boolean);
}

module.exports = {
  revisarCurso: revisarCurso,
  evaluarRecomendaciones: evaluarRecomendaciones,
};
