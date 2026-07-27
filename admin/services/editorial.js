/**
 * editorial.js — resumen EDITORIAL para la pantalla de publicación.
 *
 * Distinto y adicional a scripts/validate-data.js (que sigue siendo la
 * única fuente de verdad técnica: JSON válido, slug, imagen, estado...).
 * Aquí solo se añaden avisos de calidad de contenido que no bloquean nada
 * técnicamente pero que Secretaría querrá revisar antes de publicar. No
 * convierte nada opcional en obligatorio: todo lo de aquí son avisos.
 */
'use strict';
const cfg = require('../config');

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
  if (cfg.ESTADOS_PUBLICABLES.includes(c.estado) && c.estado !== 'finalizado' && c.inscripcionAbierta && !c.urlInscripcion) {
    add('urlInscripcion', 'Curso activo sin URL de inscripción propia: la ficha usará el botón de WhatsApp.');
  }

  return avisos;
}

/** Resumen para todos los cursos que van a publicarse (o todos, si no se filtra). */
function resumenEditorial(cursos) {
  return cursos.map((c) => ({ id: c.id, nombre: c.nombre, slug: c.slug, avisos: revisarCurso(c) }))
    .filter((r) => r.avisos.length > 0);
}

module.exports = { revisarCurso, resumenEditorial };
