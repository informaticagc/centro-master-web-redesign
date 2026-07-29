#!/usr/bin/env node
/**
 * scripts/build-fichas.js
 *
 * Genera web/cursos/{slug}/index.html para cada curso publicable, a partir
 * de la fuente única del catálogo (CatalogRepository, sobre
 * web/data/cursos.json) — nunca lee cursos.json directamente ni mantiene
 * una segunda copia de los datos.
 *
 * Estados publicables (generan ficha): proximamente, matricula-abierta,
 * ultimas-plazas, en-curso, finalizado.
 * Estados NO publicables (no generan ficha nueva): borrador, archivado.
 *
 * Idempotencia: no se embebe ningún timestamp de build (Date.now() etc.) —
 * solo datos que ya vienen en cursos.json. Ejecutar este script dos veces
 * seguidas sin cambiar los datos produce exactamente los mismos ficheros,
 * byte a byte.
 *
 * Fichas huérfanas (generadas en una ejecución anterior para un curso que
 * ahora es borrador/archivado, o que ha sido eliminado de cursos.json): NO
 * se borran. Se sustituyen por una página de redirección controlada al
 * catálogo — ver `escribirStubRedireccion`. Un curso "dado de baja" puede
 * tener enlaces externos o estar indexado por buscadores; un 404 seco pierde
 * esa señal sin explicar nada, mientras que una redirección con mensaje
 * (más `rel=canonical` al catálogo) conserva la URL, informa al usuario y
 * dirige tanto a personas como a rastreadores hacia la oferta vigente. Por
 * seguridad, solo se reescriben directorios que llevan la marca
 * MANAGED_MARKER (nunca contenido ajeno colocado a mano en /web/cursos/).
 *
 * Uso: node scripts/build-fichas.js
 * Sale con código 0 si todo fue bien, 1 si hubo algún error.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');
const CURSOS_DIR = path.join(WEB_DIR, 'cursos');
const DATA_DIR = path.join(WEB_DIR, 'data');

// Cambiar aquí cuando se decida el dominio final de publicación. Mientras
// esté vacío, no se emite <link rel="canonical"> ni og:url/og:image
// absolutos (preferible a inventar un dominio provisional incorrecto).
const SITE_BASE_URL = '';

const MANAGED_MARKER = '<!-- build-fichas:managed -->';
const ESTADOS_PUBLICABLES = ['proximamente', 'matricula-abierta', 'ultimas-plazas', 'en-curso', 'finalizado'];

// Tokens visuales, partials estructurales (header/breadcrumb/footer/widget
// de ayuda) y utilidades de formateo comunes viven en scripts/lib/ — ver
// esos módulos para el detalle. Aquí solo se importan y se componen.
const tokens = require(path.join(__dirname, 'lib', 'tokens.js'));
const partials = require(path.join(__dirname, 'lib', 'partials.js'));
const format = require(path.join(__dirname, 'lib', 'format.js'));
const { text, attr } = require(path.join(__dirname, 'lib', 'escape.js'));

const ESTADO_ORDEN_SIMILARES = { 'matricula-abierta': 0, 'ultimas-plazas': 1, 'en-curso': 2, 'proximamente': 3 };

const errores = [];
const avisos = [];
function err(msg) { errores.push(msg); }
function warn(msg) { avisos.push(msg); }

// Alias locales de las utilidades de formateo compartidas (scripts/lib/format.js)
// para no reescribir cada punto de uso de renderFichaHTML/similarCardHTML.
const esVacio = format.esVacio;
const whatsappCourseHref = format.whatsappCourseHref;
const whatsappNextIntakeHref = format.whatsappNextIntakeHref;
const estadoMeta = format.estadoMeta;
const durationLabel = format.durationLabel;
const startLabel = format.startLabel;
const certificacionNivelText = format.certificacionNivelText;
const destinatariosText = format.destinatariosText;
const sedeText = format.sedeText;
const fichaHrefDesdeFicha = format.fichaHrefDesdeFicha;
const detailSection = format.detailSection;
const buildMetaDescription = format.buildMetaDescription;
const MODALIDAD_LABELS = format.MODALIDAD_LABELS;
const TIPO_PRECIO_LABELS = format.TIPO_PRECIO_LABELS;

// ---------------------------------------------------------------------
// Carga de datos — exclusivamente vía CatalogRepository (Node/CommonJS)
// ---------------------------------------------------------------------
const CatalogRepository = require(path.join(WEB_DIR, 'js', 'catalog-repository.js'));
CatalogRepository.setBaseUrl(DATA_DIR);

/**
 * Algoritmo de "cursos similares" (solo se usa en fichas de curso
 * finalizado):
 *   1. Se excluye siempre el propio curso.
 *   2. Solo se consideran candidatos entre los cursos actualmente públicos
 *      (getPublicCourses(): proximamente/matricula-abierta/ultimas-plazas/
 *      en-curso) — nunca otro finalizado/borrador/archivado.
 *   3. Cada candidato puntúa: +4 si comparte familiaProfesional (y el curso
 *      de origen tiene una), +2 si comparte modalidad, +1 si comparte isla.
 *   4. Se ordenan por puntuación descendente y se toman como máximo 3 con
 *      puntuación > 0 → encabezado "Cursos similares disponibles ahora".
 *   5. Si NINGÚN candidato puntúa (p.ej. familiaProfesional es null en todo
 *      el catálogo, como ocurre hoy), no se inventa una similitud que no
 *      existe: se muestran hasta 3 cursos públicos cualesquiera bajo el
 *      encabezado honesto "Otros cursos disponibles", nunca como "similares".
 *   No se rellena hasta 3 con candidatos de puntuación 0 cuando sí hay
 *   alguno con puntuación > 0: si solo hay 1 o 2 coincidencias reales, se
 *   muestran solo esas (mejor mostrar menos y honesto que completar con
 *   cursos no relacionados bajo la etiqueta "similar").
 */
function calcularSimilares(curso, publicCourses) {
  const candidatos = publicCourses.filter(function (c) { return c.id !== curso.id; });
  function puntuacion(c) {
    let s = 0;
    if (curso.familiaProfesional && c.familiaProfesional === curso.familiaProfesional) s += 4;
    if (c.modalidad === curso.modalidad) s += 2;
    if (c.isla === curso.isla) s += 1;
    return s;
  }
  const puntuados = candidatos.map(function (c) { return { c: c, s: puntuacion(c) }; }).filter(function (x) { return x.s > 0; });
  if (puntuados.length > 0) {
    puntuados.sort(function (a, b) { return b.s - a.s; });
    return { heading: 'Cursos similares disponibles ahora', courses: puntuados.slice(0, 3).map(function (x) { return x.c; }) };
  }
  return { heading: 'Otros cursos disponibles', courses: candidatos.slice(0, 3) };
}

function similarCardHTML(c) {
  const meta = estadoMeta(c.estado);
  const img = c.imagen || {};
  const photo = img.src
    ? '<img src="../../' + img.src + '" alt="' + attr(img.alt || '') + '" loading="lazy" decoding="async">'
    : '';
  return '<div class="similar-card"><div class="photo">' + photo +
    '<span class="similar-status" style="background:' + meta.color + '">' + text(meta.label) + '</span></div>' +
    '<div class="body"><h3>' + text(c.nombre) + '</h3><div class="meta">' + text(MODALIDAD_LABELS[c.modalidad] || c.modalidad) + ' · ' + text(c.isla) +
    (durationLabel(c) ? ' · ' + text(durationLabel(c)) : '') + '</div>' +
    '<a href="' + fichaHrefDesdeFicha(c) + '">Ver curso →</a></div></div>';
}

// ---------------------------------------------------------------------
// Bloque superior de la ficha (Fase 1 de la nueva ficha de curso).
// Funciones locales de esta fase: prototipo del "quick facts" con icono
// antes de consolidarlas en scripts/lib/components.js (Fase 0B). No
// sustituyen ni modifican format.metaLine (sigue disponible en
// scripts/lib/format.js para cuando la Fase 0B decida qué hacer con ella).
// ---------------------------------------------------------------------
const HERO_FACT_ICONS = {
  tipoFormacion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z"></path><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"></path></svg>',
  duracion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path></svg>',
  fecha: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path></svg>',
  sede: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>',
};

// Lista semántica (<li>), no <dl>: el icono decorativo conviviendo con
// etiqueta+valor dentro del mismo ítem rompería el modelo de contenido de
// <dl> (un div hijo de <dl> solo puede contener dt/dd). Se omite limpio si
// el valor está vacío — mismo criterio que ya usaba format.metaLine.
function heroFactHTML(iconKey, label, value) {
  if (esVacio(value)) return '';
  // `label` es siempre un literal fijo pasado desde este mismo archivo
  // (nunca dato editorial) — no necesita escape. `value` sí es dato de
  // curso/sede y se escapa aquí, en el único punto de ensamblado, para
  // cubrir a la vez tipoFormacion, duracionTexto, fechaInicioAproximada,
  // fechaFin, municipio y los datos de sede que llegan ya combinados.
  return '<li class="fact-item"><span class="fact-icon" aria-hidden="true">' + HERO_FACT_ICONS[iconKey] + '</span>' +
    '<span class="fact-text"><span class="fact-label">' + label + '</span><span class="fact-value">' + text(value) + '</span></span></li>';
}

function renderFichaHTML(curso, sedesById, publicCourses) {
  const isFinished = curso.estado === 'finalizado';
  const meta = estadoMeta(curso.estado);
  const img = curso.imagen || {};
  const title = curso.nombre + ' — Centro de Estudios Máster';
  const description = buildMetaDescription(curso);
  const canonicalTag = SITE_BASE_URL ? '\n<link rel="canonical" href="' + SITE_BASE_URL + '/cursos/' + curso.slug + '/">' : '';
  const ogImage = SITE_BASE_URL && img.src ? SITE_BASE_URL + '/' + img.src : '';

  const certNivel = certificacionNivelText(curso);
  const destinatarios = destinatariosText(curso);
  const sede = sedeText(curso, sedesById);
  const facts = [
    heroFactHTML('tipoFormacion', 'Tipo de formación', curso.tipoFormacion),
    heroFactHTML('duracion', 'Duración', durationLabel(curso)),
    heroFactHTML('fecha', 'Fecha de inicio', startLabel(curso)),
    heroFactHTML('fecha', 'Fecha de fin', curso.fechaFin),
    heroFactHTML('sede', 'Sede', sede),
  ].filter(Boolean).join('');

  // CTA principal: nunca un enlace muerto. Si no hay urlInscripcion real ni
  // inscripción abierta, no se muestra ninguna CTA de "inscripción" falsa —
  // solo queda el WhatsApp de contacto.
  let primaryCta = '';
  let showSecondaryWhatsapp = true;
  if (isFinished) {
    primaryCta = '<a href="' + whatsappNextIntakeHref(curso.nombre) + '" target="_blank" rel="noopener" class="cta-solid">Consultar próxima convocatoria</a>';
    showSecondaryWhatsapp = false; // la CTA principal ya es el WhatsApp contextual
  } else if (curso.urlInscripcion) {
    const external = /^https?:\/\//.test(curso.urlInscripcion);
    primaryCta = '<a href="' + curso.urlInscripcion + '" class="cta-solid"' + (external ? ' target="_blank" rel="noopener"' : '') + '>Solicitar plaza</a>';
  } else if (curso.inscripcionAbierta) {
    primaryCta = '<a href="' + whatsappCourseHref(curso.nombre) + '" target="_blank" rel="noopener" class="cta-solid">Solicitar información</a>';
    showSecondaryWhatsapp = false; // sería el mismo enlace duplicado
  }
  const secondaryWhatsapp = showSecondaryWhatsapp
    ? '<a href="' + whatsappCourseHref(curso.nombre) + '" target="_blank" rel="noopener" class="cta-outline">📱 WhatsApp</a>'
    : '';

  const finishedBanner = isFinished
    ? '<div class="finished-banner"><span class="warn">🕘 Este curso ya ha finalizado.</span><span class="info">Se mantiene disponible como referencia. Consulta la próxima convocatoria o cursos similares abajo.</span></div>'
    : '';

  let similarHTML = '';
  if (isFinished) {
    const similar = calcularSimilares(curso, publicCourses);
    if (similar.courses.length > 0) {
      similarHTML = '<div class="similar-wrap"><h2>' + similar.heading + '</h2><div class="similar-grid">' +
        similar.courses.map(similarCardHTML).join('') + '</div></div>';
    }
  }

  const tagPrice = TIPO_PRECIO_LABELS[curso.tipoPrecio];

  return '<!DOCTYPE html>\n' +
'<html lang="es">\n' +
'<head>\n' + MANAGED_MARKER + '\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>' + title + '</title>\n' +
'<meta name="description" content="' + attr(description) + '">\n' +
'<meta property="og:type" content="article">\n' +
'<meta property="og:title" content="' + attr(title) + '">\n' +
'<meta property="og:description" content="' + attr(description) + '">\n' +
(ogImage ? '<meta property="og:image" content="' + ogImage + '">\n' : '') +
canonicalTag + '\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">\n' +
'<link rel="stylesheet" href="../../css/help-widget.css">\n' +
'<style>\n' +
tokens.ROOT_TOKENS_CSS +
tokens.BASE_RESET_CSS +
partials.HEADER_CSS_BASE +
partials.BREADCRUMB_CSS +
'  .finished-banner{background:var(--tint);border-bottom:1px solid var(--line);padding:14px 56px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}\n' +
'  .finished-banner .warn{font-size:13px;font-weight:700;color:var(--ink-soft);}\n' +
'  .finished-banner .info{font-size:13px;color:var(--ink-soft);}\n' +
'  .course-wrap{padding:40px 56px 0;}\n' +
'  .course-hero{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:start;margin-bottom:56px;}\n' +
'  .hero-photo{position:relative;border-radius:24px;overflow:hidden;aspect-ratio:16/10;background:var(--tint);box-shadow:0 20px 48px oklch(20% 0.02 260 / .12);}\n' +
'  .hero-photo img{width:100%;height:100%;object-fit:cover;}\n' +
'  .hero-photo img.finished{filter:grayscale(.55);opacity:.85;}\n' +
'  .status-badge{position:absolute;top:18px;left:18px;font-size:12.5px;font-weight:700;color:var(--surface);padding:7px 15px;border-radius:100px;box-shadow:0 4px 12px oklch(20% 0.02 260 / .18);}\n' +
'  .tag-row{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;}\n' +
'  .tag-modalidad{font-size:11.5px;font-weight:600;color:oklch(40% 0.09 200);background:oklch(94% 0.03 200);padding:5px 12px;border-radius:100px;}\n' +
'  .tag-isla, .tag-price{font-size:11.5px;font-weight:600;color:var(--ink-strong);background:oklch(93% 0.008 85);padding:5px 12px;border-radius:100px;}\n' +
'  .course-hero h1{font-weight:700;font-size:clamp(28px,4vw,40px);margin:0 0 16px;color:var(--ink-strong);line-height:1.15;}\n' +
'  .course-hero .intro{font-size:16px;color:var(--ink-soft);line-height:1.6;margin:0 0 28px;max-width:520px;}\n' +
'  .fact-grid{list-style:none;display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:0 0 28px;padding:0;}\n' +
'  .fact-item{display:flex;align-items:flex-start;gap:10px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px;}\n' +
'  .fact-icon{flex-shrink:0;width:20px;height:20px;color:var(--accent);}\n' +
'  .fact-icon svg{display:block;width:100%;height:100%;}\n' +
'  .fact-text{display:flex;flex-direction:column;}\n' +
'  .fact-label{font-size:11px;font-weight:600;color:oklch(55% 0.02 260);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;}\n' +
'  .fact-value{font-size:14px;font-weight:600;color:var(--ink);}\n' +
'  .cta-row{display:flex;gap:12px;flex-wrap:wrap;}\n' +
'  .cta-row a{min-height:44px;display:flex;align-items:center;border-radius:100px;font-size:15px;font-weight:600;padding:0 26px;}\n' +
'  .cta-solid{color:var(--surface);background:var(--accent);}\n' +
'  .cta-outline{color:var(--ink-strong);border:1px solid oklch(85% 0.01 85);gap:8px;}\n' +
'  .cta-row a:focus-visible{outline:2px solid var(--primary);outline-offset:2px;}\n' +
'  .detail-wrap{padding:0 56px 96px;max-width:1200px;}\n' +
'  .detail-section{margin-bottom:36px;}\n' +
'  .detail-section h2{font-weight:700;font-size:22px;margin:0 0 12px;color:var(--ink-strong);}\n' +
'  .detail-section p, .detail-section .plain{font-size:15px;color:oklch(38% 0.02 260);line-height:1.7;margin:0;max-width:760px;}\n' +
'  .module-box{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px 24px;}\n' +
'  .similar-wrap{padding:0 56px 96px;}\n' +
'  .similar-wrap h2{font-weight:700;font-size:26px;margin:0 0 20px;color:var(--ink-strong);}\n' +
'  .similar-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}\n' +
'  .similar-card{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden;}\n' +
'  .similar-card .photo{position:relative;aspect-ratio:16/10;background:var(--tint);}\n' +
'  .similar-card .photo img{width:100%;height:100%;object-fit:cover;}\n' +
'  .similar-status{position:absolute;top:12px;left:12px;font-size:10.5px;font-weight:700;color:var(--surface);padding:4px 10px;border-radius:100px;}\n' +
'  .similar-card .body{padding:18px;}\n' +
'  .similar-card h3{font-weight:600;font-size:15px;margin:0 0 8px;color:var(--ink-strong);line-height:1.25;}\n' +
'  .similar-card .meta{font-size:12px;color:var(--ink-soft);margin-bottom:12px;}\n' +
'  .similar-card a{font-size:13px;font-weight:600;}\n' +
partials.FOOTER_CSS_BASE +
'  @media (max-width: 1180px){\n' +
partials.HEADER_CSS_1180 +
'    .course-wrap,.detail-wrap,.similar-wrap{padding-left:32px;padding-right:32px;}\n' +
'    .course-hero{grid-template-columns:1fr;}\n' +
'    .similar-grid{grid-template-columns:repeat(2,1fr);}\n' +
'  }\n' +
'  @media (max-width: 860px){\n' +
partials.HEADER_CSS_860 +
partials.FOOTER_CSS_860 +
'    .course-wrap{padding-left:20px;padding-right:20px;}\n' +
'    .cta-row{position:sticky;bottom:0;left:0;right:0;background:var(--surface);padding:12px 20px;margin:24px -20px 0;box-shadow:0 -8px 24px oklch(20% 0.02 260 / .1);z-index:20;}\n' +
'  }\n' +
'  @media (max-width: 700px){\n' +
'    .fact-grid{grid-template-columns:1fr;}\n' +
'    .similar-grid{grid-template-columns:1fr;}\n' +
'  }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div class="wrap">\n' +
partials.renderHeaderHTML() +
partials.renderBreadcrumb([
  { label: 'Inicio', href: '../../index.html' },
  { label: 'Formación', href: '../' },
  { label: curso.nombre },
]) +
finishedBanner + '\n' +
'  <div class="course-wrap">\n' +
'    <div class="course-hero">\n' +
'      <div class="hero-photo">\n' +
(img.src ? '        <img src="../../' + img.src + '" ' + (img.srcset ? 'srcset="' + img.srcset.split(',').map(function (part) {
  const t = part.trim(); const i = t.indexOf(' ');
  return '../../' + (i === -1 ? t : t.slice(0, i)) + (i === -1 ? '' : t.slice(i));
}).join(', ') + '" ' : '') + 'sizes="(max-width:1180px) 92vw, 50vw" alt="' + attr(img.alt || '') +
// attr() protege el atributo HTML, no valida gramática CSS — la sintaxis
// de object-position queda pendiente de validar en una etapa futura.
'" style="object-position:' + attr(img.objectPosition || 'center') + ';"' + (isFinished ? ' class="finished"' : '') + '>\n' : '') +
'        <span class="status-badge" style="background:' + meta.color + '">' + text(meta.label) + '</span>\n' +
'      </div>\n' +
'      <div>\n' +
'        <div class="tag-row">\n' +
'          <span class="tag-modalidad">' + text(MODALIDAD_LABELS[curso.modalidad] || curso.modalidad) + '</span>\n' +
'          <span class="tag-isla">' + text(curso.isla) + '</span>\n' +
(tagPrice ? '          <span class="tag-price">' + tagPrice + '</span>\n' : '') +
'        </div>\n' +
'        <h1>' + text(curso.nombre) + '</h1>\n' +
(!esVacio(curso.descripcionCorta) ? '        <p class="intro">' + text(curso.descripcionCorta) + '</p>\n' : '') +
(facts ? '        <ul class="fact-grid">' + facts + '</ul>\n' : '') +
'        <div class="cta-row">\n' +
'          ' + primaryCta + '\n' +
'          ' + secondaryWhatsapp + '\n' +
'        </div>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="detail-wrap">\n' +
detailSection('Sobre este curso', !esVacio(curso.descripcionCompleta) ? '<p>' + text(curso.descripcionCompleta) + '</p>' : '') +
detailSection('Certificación / nivel', certNivel ? '<p>' + text(certNivel) + '</p>' : '') +
detailSection('Destinatarios', destinatarios ? '<p>' + text(destinatarios) + '</p>' : '') +
detailSection('Requisitos de acceso', !esVacio(curso.requisitos) ? '<p>' + curso.requisitos.map(text).join(', ') + '</p>' : '') +
detailSection('Horario', !esVacio(curso.horario) ? '<p>' + text(curso.horario) + '</p>' : '') +
detailSection('Ayudas y becas', !esVacio(curso.ayudasBecas) ? '<p>' + text(curso.ayudasBecas) + '</p>' : '') +
detailSection('Documentación necesaria', !esVacio(curso.documentacionNecesaria) ? '<p>' + curso.documentacionNecesaria.map(text).join(', ') + '</p>' : '') +
detailSection('Plazas disponibles', curso.plazasDisponibles != null ? '<p>' + text(curso.plazasDisponibles) + '</p>' : '') +
detailSection('Módulos / unidades formativas', !esVacio(curso.modulosUnidadesFormativas) ? '<div class="module-box"><p>' + curso.modulosUnidadesFormativas.map(text).join(', ') + '</p></div>' : '') +
'  </div>\n' +
similarHTML + '\n' +
partials.renderFooterHTML() +
partials.renderHelpWidgetHTML() +
'</div>\n' +
'<script src="../../js/help-widget.js"></script>\n' +
'<script>\n' +
partials.HEADER_SCRIPT +
'</script>\n' +
'</body>\n' +
'</html>\n';
}

function escribirStubRedireccion(slug, motivo) {
  const html = '<!DOCTYPE html>\n' +
'<html lang="es">\n' +
'<head>\n' + MANAGED_MARKER + '\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>Curso no disponible — Centro de Estudios Máster</title>\n' +
'<meta name="robots" content="noindex">\n' +
'<meta http-equiv="refresh" content="3; url=../">\n' +
'<link rel="canonical" href="../">\n' +
'<style>body{font-family:\'Work Sans\',sans-serif;max-width:520px;margin:15vh auto;padding:0 24px;text-align:center;color:oklch(20% 0.02 260);}a{color:oklch(30% 0.09 255);}</style>\n' +
'</head>\n' +
'<body>\n' +
'<h1>Este curso ya no está disponible</h1>\n' +
'<p>' + motivo + ' Te llevamos al catálogo de cursos vigente en unos segundos.</p>\n' +
'<p><a href="../">Ir al catálogo de cursos →</a></p>\n' +
'</body>\n' +
'</html>\n';
  const dir = path.join(CURSOS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

function esDirectorioGestionado(dir) {
  const f = path.join(dir, 'index.html');
  if (!fs.existsSync(f)) return false;
  try {
    return fs.readFileSync(f, 'utf8').indexOf(MANAGED_MARKER) !== -1;
  } catch (e) {
    return false;
  }
}

function main() {
  return Promise.all([
    CatalogRepository.getAll(),
    CatalogRepository.getSedes(),
    CatalogRepository.getPublicCourses(),
  ]).then(function (results) {
    const todos = results[0];
    const sedes = results[1];
    const publicCourses = results[2];
    const sedesById = {};
    sedes.forEach(function (s) { sedesById[s.id] = s; });

    const publicables = todos.filter(function (c) { return ESTADOS_PUBLICABLES.indexOf(c.estado) !== -1; });

    if (!fs.existsSync(CURSOS_DIR)) fs.mkdirSync(CURSOS_DIR, { recursive: true });

    // Directorios ya existentes bajo /web/cursos/ (antes de este build).
    const dirsExistentes = fs.readdirSync(CURSOS_DIR, { withFileTypes: true })
      .filter(function (d) { return d.isDirectory(); })
      .map(function (d) { return d.name; });

    const slugsPublicables = {};
    let generadas = 0;
    publicables.forEach(function (c) {
      if (!c.slug) { err('Curso "' + (c.id || '??') + '": sin slug, no se puede generar ficha.'); return; }
      slugsPublicables[c.slug] = true;
      const dir = path.join(CURSOS_DIR, c.slug);
      fs.mkdirSync(dir, { recursive: true });
      const html = renderFichaHTML(c, sedesById, publicCourses);
      fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
      generadas++;
    });

    // Fichas huérfanas: existían antes, ya no corresponden a ningún curso
    // publicable hoy. Solo se tocan si llevan la marca de este script.
    let redirigidas = 0;
    dirsExistentes.forEach(function (slug) {
      if (slugsPublicables[slug]) return;
      const dir = path.join(CURSOS_DIR, slug);
      if (!esDirectorioGestionado(dir)) {
        warn('cursos/' + slug + '/ ya no corresponde a ningún curso publicable, pero no lleva la marca de build-fichas — no se toca (contenido ajeno).');
        return;
      }
      escribirStubRedireccion(slug, 'El curso que buscabas ha dejado de estar disponible en el catálogo.');
      redirigidas++;
    });

    console.log('--- build-fichas.js ---');
    console.log('Cursos publicables: ' + publicables.length);
    console.log('Fichas generadas/actualizadas: ' + generadas);
    console.log('Fichas huérfanas redirigidas: ' + redirigidas);
    if (avisos.length) {
      console.log('Avisos: ' + avisos.length);
      avisos.forEach(function (a) { console.log('  ! ' + a); });
    }
    if (errores.length) {
      console.log('Errores: ' + errores.length);
      errores.forEach(function (e) { console.log('  ✗ ' + e); });
      console.log('\nRESULTADO: FALLÓ');
      process.exitCode = 1;
      return;
    }
    console.log('\nRESULTADO: OK');
  });
}

// Ejecuta el build solo cuando el archivo se invoca directamente (node
// scripts/build-fichas.js), nunca al hacer require() desde otro módulo —
// así admin/test/smoke.js puede importar renderFichaHTML() para probarla
// de forma aislada sin disparar una generación real de fichas ni escribir
// en disco. Patrón estándar de Node, sin cambiar el comportamiento del
// script cuando se ejecuta como CLI (uso normal, sin cambios).
if (require.main === module) {
  main().catch(function (e) {
    console.error('build-fichas.js: error inesperado:', e);
    process.exitCode = 1;
  });
}

module.exports = { renderFichaHTML: renderFichaHTML };
