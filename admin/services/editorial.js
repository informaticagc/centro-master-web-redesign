/**
 * editorial.js — resumen EDITORIAL para la pantalla de publicación.
 *
 * Distinto y adicional a scripts/validate-data.js (que sigue siendo la
 * única fuente de verdad técnica: JSON válido, slug, imagen, estado...).
 * Aquí solo se añaden avisos de calidad de contenido que no bloquean nada
 * técnicamente pero que Secretaría querrá revisar antes de publicar. No
 * convierte nada opcional en obligatorio: todo lo de aquí son avisos.
 *
 * Las reglas en sí viven en scripts/lib/editorial-rules.js (motor único,
 * compartido con scripts/validate-data.js) — este fichero es solo la
 * adaptación al formato que necesita la pantalla de publicación del panel.
 */
'use strict';
const { revisarCurso } = require('../../scripts/lib/editorial-rules.js');

/** Resumen para todos los cursos que van a publicarse (o todos, si no se filtra). */
function resumenEditorial(cursos) {
  return cursos.map((c) => ({ id: c.id, nombre: c.nombre, slug: c.slug, avisos: revisarCurso(c) }))
    .filter((r) => r.avisos.length > 0);
}

module.exports = { revisarCurso, resumenEditorial };
