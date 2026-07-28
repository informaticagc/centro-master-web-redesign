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
const ESTADO_ORDEN_SIMILARES = { 'matricula-abierta': 0, 'ultimas-plazas': 1, 'en-curso': 2, 'proximamente': 3 };

const errores = [];
const avisos = [];
function err(msg) { errores.push(msg); }
function warn(msg) { avisos.push(msg); }

function esVacio(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// ---------------------------------------------------------------------
// Carga de datos — exclusivamente vía CatalogRepository (Node/CommonJS)
// ---------------------------------------------------------------------
const CatalogRepository = require(path.join(WEB_DIR, 'js', 'catalog-repository.js'));
CatalogRepository.setBaseUrl(DATA_DIR);

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
    ? '<img src="../../' + img.src + '" alt="' + (img.alt || '') + '" loading="lazy" decoding="async">'
    : '';
  return '<div class="similar-card"><div class="photo">' + photo +
    '<span class="similar-status" style="background:' + meta.color + '">' + meta.label + '</span></div>' +
    '<div class="body"><h3>' + c.nombre + '</h3><div class="meta">' + (MODALIDAD_LABELS[c.modalidad] || c.modalidad) + ' · ' + c.isla +
    (durationLabel(c) ? ' · ' + durationLabel(c) : '') + '</div>' +
    '<a href="' + fichaHrefDesdeFicha(c) + '">Ver curso →</a></div></div>';
}

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
    metaLine('Tipo de formación', curso.tipoFormacion),
    metaLine('Duración', durationLabel(curso)),
    metaLine('Fecha de inicio', startLabel(curso)),
    metaLine('Fecha de fin', curso.fechaFin),
    metaLine('Sede', sede),
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
'<meta name="description" content="' + description.replace(/"/g, '&quot;') + '">\n' +
'<meta property="og:type" content="article">\n' +
'<meta property="og:title" content="' + title.replace(/"/g, '&quot;') + '">\n' +
'<meta property="og:description" content="' + description.replace(/"/g, '&quot;') + '">\n' +
(ogImage ? '<meta property="og:image" content="' + ogImage + '">\n' : '') +
canonicalTag + '\n' +
'<link rel="preconnect" href="https://fonts.googleapis.com">\n' +
'<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">\n' +
'<link rel="stylesheet" href="../../css/help-widget.css">\n' +
'<style>\n' +
'  :root{ --bg: oklch(98% 0.012 85); --ink: oklch(20% 0.02 260); --ink-soft: oklch(45% 0.02 260); --ink-strong: oklch(16% 0.02 260); --primary: oklch(30% 0.09 255); --accent: oklch(66% 0.17 45); --line: oklch(91% 0.01 85); --surface: oklch(99.5% 0.004 85); --tint: oklch(96% 0.012 85); --dark: oklch(15% 0.02 260); }\n' +
'  *{box-sizing:border-box;}\n' +
'  body{margin:0;background:var(--bg);color:var(--ink);font-family:\'Work Sans\',sans-serif;}\n' +
'  a{color:var(--primary);text-decoration:none;}\n' +
'  a:hover{color:oklch(56% 0.15 45);}\n' +
'  h1,h2,h3{font-family:\'Sora\',sans-serif;}\n' +
'  .wrap{width:100%;max-width:1920px;margin:0 auto;overflow-x:hidden;}\n' +
'  @media (prefers-reduced-motion: reduce){ *{animation-duration:0.001ms !important; transition-duration:0.001ms !important; transition:none !important;} }\n' +
'  .top-bar{display:flex;align-items:center;justify-content:flex-end;gap:20px;padding:9px 56px;background:var(--tint);border-bottom:1px solid var(--line);}\n' +
'  .top-bar a{font-size:12.5px;font-weight:500;color:var(--ink-soft);white-space:nowrap;}\n' +
'  header{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:16px 56px;background:oklch(99.5% 0.004 85 / .92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);}\n' +
'  .nav-primary{display:flex;align-items:center;gap:28px;}\n' +
'  nav a{white-space:nowrap;font-size:15px;font-weight:500;color:var(--ink);}\n' +
'  .nav-secondary{font-size:14px;font-weight:500;color:var(--ink-soft);border-right:1px solid var(--line);padding-right:24px;}\n' +
'  .cta-pill{white-space:nowrap;font-size:15px;font-weight:600;color:var(--surface);background:var(--accent);padding:14px 22px;border-radius:100px;}\n' +
'  .sitenav{display:flex;align-items:center;gap:28px;}\n' +
'  .nav-toggle{display:none;flex-shrink:0;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--surface);cursor:pointer;padding:0;}\n' +
'  .nav-toggle .bars{display:flex;flex-direction:column;gap:4px;width:20px;}\n' +
'  .nav-toggle .bars span{display:block;height:2px;width:100%;background:var(--ink);border-radius:2px;}\n' +
'  #mobileOverlay{position:fixed;inset:0;background:oklch(12% 0.03 260 / .55);z-index:60;}\n' +
'  #mobileDrawer{position:fixed;top:0;right:0;height:100%;width:min(320px,86vw);background:var(--surface);box-shadow:-12px 0 32px oklch(20% 0.02 260 / .18);z-index:61;display:flex;flex-direction:column;padding:20px;overflow-y:auto;}\n' +
'  #mobileOverlay[hidden], #mobileDrawer[hidden]{display:none;}\n' +
'  .drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;}\n' +
'  .drawer-close{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid var(--line);background:oklch(98% 0.008 85);font-size:22px;cursor:pointer;}\n' +
'  .drawer-nav a{font-size:16px;font-weight:600;color:var(--ink);padding:14px 10px;border-radius:10px;min-height:44px;display:flex;align-items:center;}\n' +
'  .drawer-nav a.corp{font-size:14.5px;font-weight:500;color:var(--ink-soft);}\n' +
'  .drawer-subhead{font-size:11px;font-weight:600;color:oklch(55% 0.02 260);text-transform:uppercase;letter-spacing:.05em;margin:20px 0 6px;padding:0 10px;}\n' +
'  .breadcrumb{padding:14px 56px;font-size:13px;color:oklch(50% 0.02 260);border-bottom:1px solid oklch(93% 0.008 85);}\n' +
'  .breadcrumb a{color:oklch(50% 0.02 260);}\n' +
'  .finished-banner{background:var(--tint);border-bottom:1px solid var(--line);padding:14px 56px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}\n' +
'  .finished-banner .warn{font-size:13px;font-weight:700;color:var(--ink-soft);}\n' +
'  .finished-banner .info{font-size:13px;color:var(--ink-soft);}\n' +
'  .course-wrap{padding:40px 56px 0;}\n' +
'  .course-hero{display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:start;margin-bottom:48px;}\n' +
'  .hero-photo{position:relative;border-radius:24px;overflow:hidden;aspect-ratio:16/10;background:var(--tint);}\n' +
'  .hero-photo img{width:100%;height:100%;object-fit:cover;}\n' +
'  .hero-photo img.finished{filter:grayscale(.55);opacity:.85;}\n' +
'  .status-badge{position:absolute;top:16px;left:16px;font-size:12px;font-weight:700;color:var(--surface);padding:6px 13px;border-radius:100px;}\n' +
'  .tag-row{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;}\n' +
'  .tag-modalidad{font-size:11.5px;font-weight:600;color:oklch(40% 0.09 200);background:oklch(94% 0.03 200);padding:5px 12px;border-radius:100px;}\n' +
'  .tag-isla, .tag-price{font-size:11.5px;font-weight:600;color:var(--ink-strong);background:oklch(93% 0.008 85);padding:5px 12px;border-radius:100px;}\n' +
'  .course-hero h1{font-weight:700;font-size:34px;margin:0 0 14px;color:var(--ink-strong);line-height:1.12;}\n' +
'  .course-hero .intro{font-size:15.5px;color:var(--ink-soft);line-height:1.6;margin:0 0 24px;max-width:520px;}\n' +
'  .course-facts{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:28px;}\n' +
'  .fact-label{font-size:11px;font-weight:600;color:oklch(55% 0.02 260);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;}\n' +
'  .fact-value{font-size:14px;font-weight:600;color:var(--ink);}\n' +
'  .cta-row{display:flex;gap:12px;flex-wrap:wrap;}\n' +
'  .cta-row a{min-height:44px;display:flex;align-items:center;border-radius:100px;font-size:15px;font-weight:600;padding:0 26px;}\n' +
'  .cta-solid{color:var(--surface);background:var(--accent);}\n' +
'  .cta-outline{color:var(--ink-strong);border:1px solid oklch(85% 0.01 85);gap:8px;}\n' +
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
'  footer{padding:64px 56px 32px;background:var(--dark);color:oklch(85% 0.008 260);}\n' +
'  .footer-grid{display:grid;grid-template-columns:1.3fr repeat(4,1fr);gap:32px;margin-bottom:48px;}\n' +
'  .footer-brand-title{font-family:\'Sora\',sans-serif;font-weight:700;font-size:19px;color:oklch(97% 0.004 85);margin-bottom:14px;}\n' +
'  .footer-brand p{font-size:13.5px;line-height:1.6;color:oklch(72% 0.01 260);max-width:250px;margin:0 0 16px;}\n' +
'  .social-row a{font-size:13px;font-weight:500;color:oklch(85% 0.008 260);}\n' +
'  .footer-col-title{font-size:12.5px;font-weight:600;color:oklch(97% 0.004 85);text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;}\n' +
'  .footer-col a{display:block;font-size:13.5px;color:oklch(75% 0.01 260);margin-bottom:10px;}\n' +
'  .footer-bottom{display:flex;justify-content:space-between;align-items:center;padding-top:28px;border-top:1px solid oklch(28% 0.02 260);font-size:12.5px;color:oklch(60% 0.01 260);flex-wrap:wrap;gap:12px;}\n' +
'  @media (max-width: 1180px){\n' +
'    header{padding-left:28px;padding-right:28px;}\n' +
'    .nav-secondary{display:none;}\n' +
'    .top-bar{padding-left:28px;padding-right:28px;gap:14px;}\n' +
'    .course-wrap,.detail-wrap,.similar-wrap{padding-left:32px;padding-right:32px;}\n' +
'    .course-hero{grid-template-columns:1fr;}\n' +
'    .course-facts{grid-template-columns:repeat(2,1fr);}\n' +
'    .similar-grid{grid-template-columns:repeat(2,1fr);}\n' +
'  }\n' +
'  @media (max-width: 860px){\n' +
'    .top-bar{display:none;}\n' +
'    .nav-primary{display:none;}\n' +
'    .nav-toggle{display:inline-flex;}\n' +
'    .footer-grid{grid-template-columns:1fr 1fr;}\n' +
'    .footer-brand{grid-column:1/-1;}\n' +
'    .cta-row{position:sticky;bottom:0;left:0;right:0;background:var(--surface);padding:12px 20px;margin:24px -20px 0;box-shadow:0 -8px 24px oklch(20% 0.02 260 / .1);z-index:20;}\n' +
'  }\n' +
'  @media (max-width: 700px){\n' +
'    .course-facts{grid-template-columns:1fr 1fr;}\n' +
'    .similar-grid{grid-template-columns:1fr;}\n' +
'  }\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div class="wrap">\n' +
'  <div class="top-bar">\n' +
'    <a href="#">Selección</a><a href="#">Docentes</a><a href="#">Portal de transparencia</a><a href="#">Canal de denuncias</a>\n' +
'    <a href="#" style="border-left:1px solid oklch(88% 0.01 85);padding-left:20px;">Intranet Microsoft ↗</a>\n' +
'  </div>\n' +
'  <header>\n' +
'    <img src="../../assets/logo-cem.png" alt="Centro de Estudios Máster" style="width:150px;height:38px;object-fit:contain;">\n' +
'    <nav class="sitenav">\n' +
'      <span class="nav-primary">\n' +
'        <a href="../../index.html#cursos">Formación ⌄</a>\n' +
'        <a href="../../index.html#empleo">Empleo</a>\n' +
'        <a href="../../index.html#nosotros">Sobre nosotros</a>\n' +
'        <a href="../../index.html#contacto">Contacto</a>\n' +
'      </span>\n' +
'      <a href="#" class="nav-secondary">Campus Virtual ↗</a>\n' +
'      <a href="../" class="cta-pill">Encontrar un curso</a>\n' +
'      <button id="navToggle" class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobileDrawer" aria-label="Abrir menú">\n' +
'        <span class="bars"><span></span><span></span><span></span></span>\n' +
'      </button>\n' +
'    </nav>\n' +
'  </header>\n' +
'  <div id="mobileOverlay" hidden></div>\n' +
'  <div id="mobileDrawer" role="dialog" aria-modal="true" aria-label="Menú de navegación" hidden>\n' +
'    <div class="drawer-head">\n' +
'      <img src="../../assets/logo-cem.png" alt="Centro de Estudios Máster" style="width:130px;height:34px;object-fit:contain;">\n' +
'      <button id="drawerClose" class="drawer-close" type="button" aria-label="Cerrar menú">×</button>\n' +
'    </div>\n' +
'    <nav class="drawer-nav">\n' +
'      <a href="../../index.html#cursos">Formación</a>\n' +
'      <a href="../../index.html#empleo">Empleo</a>\n' +
'      <a href="../../index.html#nosotros">Sobre nosotros</a>\n' +
'      <a href="../../index.html#contacto">Contacto</a>\n' +
'      <a href="#">Campus Virtual ↗</a>\n' +
'    </nav>\n' +
'    <div class="drawer-subhead">Accesos corporativos</div>\n' +
'    <nav class="drawer-nav">\n' +
'      <a href="#" class="corp">Selección</a><a href="#" class="corp">Docentes</a><a href="#" class="corp">Portal de transparencia</a><a href="#" class="corp">Canal de denuncias</a><a href="#" class="corp">Intranet Microsoft ↗</a>\n' +
'    </nav>\n' +
'  </div>\n' +
'  <div class="breadcrumb"><a href="../../index.html">Inicio</a> <span>/</span> <a href="../">Formación</a> <span>/</span> <span style="color:var(--ink);font-weight:600;">' + curso.nombre + '</span></div>\n' +
finishedBanner + '\n' +
'  <div class="course-wrap">\n' +
'    <div class="course-hero">\n' +
'      <div class="hero-photo">\n' +
(img.src ? '        <img src="../../' + img.src + '" ' + (img.srcset ? 'srcset="' + img.srcset.split(',').map(function (part) {
  const t = part.trim(); const i = t.indexOf(' ');
  return '../../' + (i === -1 ? t : t.slice(0, i)) + (i === -1 ? '' : t.slice(i));
}).join(', ') + '" ' : '') + 'sizes="(max-width:1180px) 92vw, 50vw" alt="' + (img.alt || '') + '" style="object-position:' + (img.objectPosition || 'center') + ';"' + (isFinished ? ' class="finished"' : '') + '>\n' : '') +
'        <span class="status-badge" style="background:' + meta.color + '">' + meta.label + '</span>\n' +
'      </div>\n' +
'      <div>\n' +
'        <div class="tag-row">\n' +
'          <span class="tag-modalidad">' + (MODALIDAD_LABELS[curso.modalidad] || curso.modalidad) + '</span>\n' +
'          <span class="tag-isla">' + curso.isla + '</span>\n' +
(tagPrice ? '          <span class="tag-price">' + tagPrice + '</span>\n' : '') +
'        </div>\n' +
'        <h1>' + curso.nombre + '</h1>\n' +
(!esVacio(curso.descripcionCorta) ? '        <p class="intro">' + curso.descripcionCorta + '</p>\n' : '') +
(facts ? '        <div class="course-facts">' + facts + '</div>\n' : '') +
'        <div class="cta-row">\n' +
'          ' + primaryCta + '\n' +
'          ' + secondaryWhatsapp + '\n' +
'        </div>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="detail-wrap">\n' +
detailSection('Sobre este curso', !esVacio(curso.descripcionCompleta) ? '<p>' + curso.descripcionCompleta + '</p>' : '') +
detailSection('Certificación / nivel', certNivel ? '<p>' + certNivel + '</p>' : '') +
detailSection('Destinatarios', destinatarios ? '<p>' + destinatarios + '</p>' : '') +
detailSection('Requisitos de acceso', !esVacio(curso.requisitos) ? '<p>' + curso.requisitos.join(', ') + '</p>' : '') +
detailSection('Horario', !esVacio(curso.horario) ? '<p>' + curso.horario + '</p>' : '') +
detailSection('Ayudas y becas', !esVacio(curso.ayudasBecas) ? '<p>' + curso.ayudasBecas + '</p>' : '') +
detailSection('Documentación necesaria', !esVacio(curso.documentacionNecesaria) ? '<p>' + curso.documentacionNecesaria.join(', ') + '</p>' : '') +
detailSection('Plazas disponibles', curso.plazasDisponibles != null ? '<p>' + curso.plazasDisponibles + '</p>' : '') +
detailSection('Módulos / unidades formativas', !esVacio(curso.modulosUnidadesFormativas) ? '<div class="module-box"><p>' + curso.modulosUnidadesFormativas.join(', ') + '</p></div>' : '') +
'  </div>\n' +
similarHTML + '\n' +
'  <footer>\n' +
'    <div class="footer-grid">\n' +
'      <div class="footer-brand">\n' +
'        <div class="footer-brand-title">Centro de Estudios Máster</div>\n' +
'        <p>Formación para el empleo en Canarias desde hace más de 30 años.</p>\n' +
'        <div class="social-row" style="display:flex;gap:14px;">\n' +
'          <a href="https://www.instagram.com/centrodeestudiosmaster/">Instagram</a>\n' +
'          <a href="https://www.facebook.com/CentroDeEstudiosMaster/">Facebook</a>\n' +
'          <a href="https://www.tiktok.com/@centrodeestudiosmaster">Tiktok</a>\n' +
'        </div>\n' +
'      </div>\n' +
'      <div class="footer-col"><div class="footer-col-title">Formación</div><a href="#">Cursos</a><a href="#">Desempleados</a><a href="#">Ocupados</a><a href="#">Formación privada</a><a href="#">Teleformación</a></div>\n' +
'      <div class="footer-col"><div class="footer-col-title">Centro</div><a href="#">Sobre nosotros</a><a href="#">Centros</a><a href="#">Contacto</a><a href="#">Empleo</a></div>\n' +
'      <div class="footer-col"><div class="footer-col-title">Accesos</div><a href="#">Campus Virtual</a><a href="#">Portal de transparencia</a><a href="#">Docentes</a><a href="#">Canal de denuncias</a></div>\n' +
'      <div class="footer-col"><div class="footer-col-title">Legal</div><a href="#">Privacidad</a><a href="#">Cookies</a><a href="#">Aviso legal</a><a href="#">Canal de denuncias</a></div>\n' +
'    </div>\n' +
'    <div class="footer-bottom">\n' +
'      <span>© 2026 Centro de Estudios Máster. Todos los derechos reservados.</span>\n' +
'      <span>928 75 51 05 · secretariavc@centromaster.com</span>\n' +
'    </div>\n' +
'  </footer>\n' +
'  <div class="help-hub">\n' +
'    <div id="helpPanel" class="help-panel" role="dialog" aria-modal="true" aria-label="Centro de contacto" tabindex="-1" hidden>\n' +
'      <div class="help-panel-head">\n' +
'        <h3>¿Cómo podemos ayudarte?</h3>\n' +
'        <p>Elige cómo prefieres contactar con Centro de Estudios Máster.</p>\n' +
'      </div>\n' +
'      <div class="help-panel-body">\n' +
'        <div class="help-option"><div class="title">💬 Hablar con el asistente</div><p>Encuentra cursos, resuelve dudas o déjanos tus datos.</p><a class="help-btn-primary" href="../../index.html#buscador">Abrir asistente</a></div>\n' +
'        <div class="help-option"><div class="title">📱 WhatsApp</div><p>Escríbenos directamente y te respondemos lo antes posible.</p><a class="help-btn-wa" href="https://wa.me/34682821956?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20los%20cursos%20de%20Centro%20de%20Estudios%20M%C3%A1ster." target="_blank" rel="noopener">Continuar por WhatsApp</a></div>\n' +
'        <div class="help-option"><div class="title">✉️ Solicitar que me contacten</div><p>Déjanos tus datos y un asesor se pondrá en contacto contigo.</p><a class="help-btn-secondary" href="../../index.html#contacto">Solicitar contacto</a></div>\n' +
'      </div>\n' +
'    </div>\n' +
'    <button id="helpFab" class="help-fab" type="button" aria-expanded="false" aria-controls="helpPanel" aria-label="¿Necesitas ayuda? Abrir centro de contacto">\n' +
'      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3C6.48 3 2 6.8 2 11.5c0 2.4 1.16 4.56 3.03 6.11-.1.98-.5 2.4-1.36 3.6 1.6-.2 3.2-.85 4.4-1.7 1.2.38 2.52.6 3.93.6 5.52 0 10-3.8 10-8.6S17.52 3 12 3Z" fill="#fff"/></svg>\n' +
'      <span class="help-label">¿Necesitas ayuda?</span>\n' +
'    </button>\n' +
'  </div>\n' +
'</div>\n' +
'<script src="../../js/help-widget.js"></script>\n' +
'<script>\n' +
'  var navToggle = document.getElementById(\'navToggle\');\n' +
'  var drawer = document.getElementById(\'mobileDrawer\');\n' +
'  var overlay = document.getElementById(\'mobileOverlay\');\n' +
'  var drawerClose = document.getElementById(\'drawerClose\');\n' +
'  function openDrawer(){ drawer.hidden=false; overlay.hidden=false; navToggle.setAttribute(\'aria-expanded\',\'true\'); document.body.style.overflow=\'hidden\'; drawerClose.focus(); }\n' +
'  function closeDrawer(){ drawer.hidden=true; overlay.hidden=true; navToggle.setAttribute(\'aria-expanded\',\'false\'); document.body.style.overflow=\'\'; navToggle.focus(); }\n' +
'  navToggle.addEventListener(\'click\', function(){ if (drawer.hidden) openDrawer(); else closeDrawer(); });\n' +
'  drawerClose.addEventListener(\'click\', closeDrawer);\n' +
'  overlay.addEventListener(\'click\', closeDrawer);\n' +
'  document.addEventListener(\'keydown\', function(e){ if (e.key===\'Escape\' && !drawer.hidden) closeDrawer(); });\n' +
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

main().catch(function (e) {
  console.error('build-fichas.js: error inesperado:', e);
  process.exitCode = 1;
});
