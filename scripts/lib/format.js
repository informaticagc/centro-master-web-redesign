#!/usr/bin/env node
/**
 * scripts/lib/format.js
 *
 * Utilidades comunes de formateo de datos de curso, extraídas sin cambios
 * de scripts/build-fichas.js. Cada función es pura: recibe datos ya
 * validados y devuelve texto u HTML; ninguna aplica reglas de negocio
 * nuevas ni depende de estado global mutable. No leen ni escriben en disco.
 */
'use strict';

const ESTADO_META = {
  'proximamente': { label: 'Próximamente', color: 'oklch(45% 0.02 260)' },
  'matricula-abierta': { label: 'Matrícula abierta', color: 'oklch(52% 0.14 150)' },
  'ultimas-plazas': { label: 'Últimas plazas', color: 'oklch(58% 0.17 40)' },
  'en-curso': { label: 'En curso', color: 'oklch(50% 0.12 250)' },
  'finalizado': { label: 'Finalizado', color: 'oklch(45% 0.02 260)' },
};
const MODALIDAD_LABELS = { presencial: 'Presencial', teleformacion: 'Teleformación' };
const TIPO_PRECIO_LABELS = { gratuito: 'Gratuito', privado: 'Privado' };
const NIVEL_LABELS = { 'nivel-1': 'Nivel 1', 'nivel-2': 'Nivel 2', 'nivel-3': 'Nivel 3' };
const SITUACION_DEST_LABELS = { desempleado: 'Desempleados/as', ocupado: 'Ocupados/as' };

function esVacio(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

function whatsappHref(texto) {
  return 'https://wa.me/34682821956?text=' + encodeURIComponent(texto);
}
function whatsappCourseHref(nombre) {
  return whatsappHref('Hola, quiero información sobre el curso: ' + nombre + '.');
}
function whatsappNextIntakeHref(nombre) {
  return whatsappHref('Hola, quiero información sobre la próxima convocatoria del curso: ' + nombre + '.');
}

function estadoMeta(estado) { return ESTADO_META[estado] || { label: estado, color: 'oklch(55% 0.02 260)' }; }
function durationLabel(c) { if (c.duracionHoras) return c.duracionHoras + 'h'; if (c.duracionTexto) return c.duracionTexto; return null; }
function startLabel(c) { return c.fechaInicio || c.fechaInicioAproximada || null; }
function priceLabel(c) { return TIPO_PRECIO_LABELS[c.tipoPrecio] || null; }

function certificacionNivelText(c) {
  if (!c.certificacion) return null; // nunca sustituir por tipoFormacion (serían datos duplicados)
  const nivel = c.nivel && NIVEL_LABELS[c.nivel] ? ' ' + NIVEL_LABELS[c.nivel] : '';
  return c.certificacion + nivel;
}
function destinatariosText(c) {
  const arr = (c.situacionDestinataria || []).map(function (v) { return SITUACION_DEST_LABELS[v] || v; });
  return arr.length ? arr.join(', ') : null;
}
function sedeText(c, sedesById) {
  if (c.sedeId && sedesById[c.sedeId]) {
    const s = sedesById[c.sedeId];
    return s.municipio + (s.region ? ' (' + s.region + ')' : '');
  }
  return c.municipio || null;
}

// urlFicha (si existe) se expresa en relativo a /web/. slug/otro-slug se
// resuelven relativos a /web/cursos/. Cada consumidor antepone el prefijo
// correcto según su propia profundidad.
function fichaHrefDesdeWeb(c) { return c.urlFicha || ('cursos/' + c.slug + '/'); }
function fichaHrefDesdeFicha(c) { return c.urlFicha ? ('../../' + c.urlFicha) : ('../' + c.slug + '/'); }

function metaLine(label, value) {
  if (esVacio(value)) return '';
  return '<div><div class="fact-label">' + label + '</div><div class="fact-value">' + value + '</div></div>';
}
function detailSection(title, bodyHtml) {
  if (!bodyHtml) return '';
  return '<div class="detail-section"><h2>' + title + '</h2>' + bodyHtml + '</div>';
}

function buildMetaDescription(c) {
  if (!esVacio(c.descripcionCorta)) return c.descripcionCorta;
  // Sin descripción redactada: se combina únicamente con datos objetivos ya
  // existentes, sin inventar ningún texto editorial.
  const partes = [c.nombre];
  if (c.modalidad) partes.push(MODALIDAD_LABELS[c.modalidad] || c.modalidad);
  if (c.isla) partes.push(c.isla);
  if (c.tipoPrecio) partes.push(TIPO_PRECIO_LABELS[c.tipoPrecio]);
  return partes.join(' — ') + '. Formación de Centro de Estudios Máster.';
}

module.exports = {
  ESTADO_META: ESTADO_META,
  MODALIDAD_LABELS: MODALIDAD_LABELS,
  TIPO_PRECIO_LABELS: TIPO_PRECIO_LABELS,
  NIVEL_LABELS: NIVEL_LABELS,
  SITUACION_DEST_LABELS: SITUACION_DEST_LABELS,
  esVacio: esVacio,
  whatsappHref: whatsappHref,
  whatsappCourseHref: whatsappCourseHref,
  whatsappNextIntakeHref: whatsappNextIntakeHref,
  estadoMeta: estadoMeta,
  durationLabel: durationLabel,
  startLabel: startLabel,
  priceLabel: priceLabel,
  certificacionNivelText: certificacionNivelText,
  destinatariosText: destinatariosText,
  sedeText: sedeText,
  fichaHrefDesdeWeb: fichaHrefDesdeWeb,
  fichaHrefDesdeFicha: fichaHrefDesdeFicha,
  metaLine: metaLine,
  detailSection: detailSection,
  buildMetaDescription: buildMetaDescription,
};
