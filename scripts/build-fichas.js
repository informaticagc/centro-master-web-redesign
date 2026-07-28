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
const metaLine = format.metaLine;
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
    ? '<img src="../../' + img.src + '" alt="' + (img.alt || '') + '" loading="lazy" decoding="async">'
    : '';
  return '<div class="similar-card"><div class="photo">' + photo +
    '<span class="similar-status" style="background:' + meta.color + '">' + meta.label + '</span></div>' +
    '<div class="body"><h3>' + c.nombre + '</h3><div class="meta">' + (MODALIDAD_LABELS[c.modalidad] || c.modalidad) + ' · ' + c.isla +
    (durationLabel(c) ? ' · ' + durationLabel(c) : '') + '</div>' +
    '<a href="' + fichaHrefDesdeFicha(c) + '">Ver curso →</a></div></div>';
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
tokens.ROOT_TOKENS_CSS +
tokens.BASE_RESET_CSS +
partials.HEADER_CSS_BASE +
partials.BREADCRUMB_CSS +
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
partials.FOOTER_CSS_BASE +
'  @media (max-width: 1180px){\n' +
partials.HEADER_CSS_1180 +
'    .course-wrap,.detail-wrap,.similar-wrap{padding-left:32px;padding-right:32px;}\n' +
'    .course-hero{grid-template-columns:1fr;}\n' +
'    .course-facts{grid-template-columns:repeat(2,1fr);}\n' +
'    .similar-grid{grid-template-columns:repeat(2,1fr);}\n' +
'  }\n' +
'  @media (max-width: 860px){\n' +
partials.HEADER_CSS_860 +
partials.FOOTER_CSS_860 +
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

main().catch(function (e) {
  console.error('build-fichas.js: error inesperado:', e);
  process.exitCode = 1;
});
