#!/usr/bin/env node
/**
 * scripts/lib/partials.js
 *
 * Partials estructurales compartidos: cabecera + menú móvil, breadcrumb,
 * pie de página y widget de ayuda. Extraídos sin cambios de
 * scripts/build-fichas.js (contenido idéntico, solo reorganizado).
 *
 * Cada función es pura: recibe datos (si los necesita) y devuelve texto
 * HTML/CSS/JS. Ninguna lee ni escribe en disco, ninguna aplica reglas de
 * negocio nuevas.
 *
 * Los enlaces relativos (../../, ../) asumen la profundidad de una ficha
 * de curso (web/cursos/[slug]/index.html), que es el único consumidor de
 * este módulo en esta fase. Si en el futuro se reutiliza desde una página
 * a otra profundidad (p.ej. el catálogo), estas funciones deberán aceptar
 * las rutas base como parámetro — no se anticipa esa necesidad aquí.
 */
'use strict';

// ---------------------------------------------------------------------
// Cabecera + menú móvil
// ---------------------------------------------------------------------

const HEADER_CSS_BASE =
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
'  .drawer-subhead{font-size:11px;font-weight:600;color:oklch(55% 0.02 260);text-transform:uppercase;letter-spacing:.05em;margin:20px 0 6px;padding:0 10px;}\n';

// Fragmentos de las media queries de la ficha que corresponden a la
// cabecera (el resto de cada bloque @media es específico de la ficha y
// permanece en build-fichas.js).
const HEADER_CSS_1180 =
'    header{padding-left:28px;padding-right:28px;}\n' +
'    .nav-secondary{display:none;}\n' +
'    .top-bar{padding-left:28px;padding-right:28px;gap:14px;}\n';
const HEADER_CSS_860 =
'    .top-bar{display:none;}\n' +
'    .nav-primary{display:none;}\n' +
'    .nav-toggle{display:inline-flex;}\n';

function renderHeaderHTML() {
  return '  <div class="top-bar">\n' +
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
'  </div>\n';
}

// Script de interacción del menú móvil (toggle del drawer). Se inserta tal
// cual dentro de un bloque <script>…</script> ya abierto por el consumidor.
const HEADER_SCRIPT =
'  var navToggle = document.getElementById(\'navToggle\');\n' +
'  var drawer = document.getElementById(\'mobileDrawer\');\n' +
'  var overlay = document.getElementById(\'mobileOverlay\');\n' +
'  var drawerClose = document.getElementById(\'drawerClose\');\n' +
'  function openDrawer(){ drawer.hidden=false; overlay.hidden=false; navToggle.setAttribute(\'aria-expanded\',\'true\'); document.body.style.overflow=\'hidden\'; drawerClose.focus(); }\n' +
'  function closeDrawer(){ drawer.hidden=true; overlay.hidden=true; navToggle.setAttribute(\'aria-expanded\',\'false\'); document.body.style.overflow=\'\'; navToggle.focus(); }\n' +
'  navToggle.addEventListener(\'click\', function(){ if (drawer.hidden) openDrawer(); else closeDrawer(); });\n' +
'  drawerClose.addEventListener(\'click\', closeDrawer);\n' +
'  overlay.addEventListener(\'click\', closeDrawer);\n' +
'  document.addEventListener(\'keydown\', function(e){ if (e.key===\'Escape\' && !drawer.hidden) closeDrawer(); });\n';

// ---------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------

const BREADCRUMB_CSS =
'  .breadcrumb{padding:14px 56px;font-size:13px;color:oklch(50% 0.02 260);border-bottom:1px solid oklch(93% 0.008 85);}\n' +
'  .breadcrumb a{color:oklch(50% 0.02 260);}\n';

/**
 * items: array de { label, href? }. El último elemento sin `href` se
 * renderiza como el escalón activo (mismo estilo que ya usaba la ficha).
 * No decide la ruta de navegación — eso lo compone quien la llama.
 */
function renderBreadcrumb(items) {
  const partes = items.map(function (item) {
    return item.href
      ? '<a href="' + item.href + '">' + item.label + '</a>'
      : '<span style="color:var(--ink);font-weight:600;">' + item.label + '</span>';
  });
  return '  <div class="breadcrumb">' + partes.join(' <span>/</span> ') + '</div>\n';
}

// ---------------------------------------------------------------------
// Pie de página
// ---------------------------------------------------------------------

const FOOTER_CSS_BASE =
'  footer{padding:64px 56px 32px;background:var(--dark);color:oklch(85% 0.008 260);}\n' +
'  .footer-grid{display:grid;grid-template-columns:1.3fr repeat(4,1fr);gap:32px;margin-bottom:48px;}\n' +
'  .footer-brand-title{font-family:\'Sora\',sans-serif;font-weight:700;font-size:19px;color:oklch(97% 0.004 85);margin-bottom:14px;}\n' +
'  .footer-brand p{font-size:13.5px;line-height:1.6;color:oklch(72% 0.01 260);max-width:250px;margin:0 0 16px;}\n' +
'  .social-row a{font-size:13px;font-weight:500;color:oklch(85% 0.008 260);}\n' +
'  .footer-col-title{font-size:12.5px;font-weight:600;color:oklch(97% 0.004 85);text-transform:uppercase;letter-spacing:.05em;margin-bottom:16px;}\n' +
'  .footer-col a{display:block;font-size:13.5px;color:oklch(75% 0.01 260);margin-bottom:10px;}\n' +
'  .footer-bottom{display:flex;justify-content:space-between;align-items:center;padding-top:28px;border-top:1px solid oklch(28% 0.02 260);font-size:12.5px;color:oklch(60% 0.01 260);flex-wrap:wrap;gap:12px;}\n';

const FOOTER_CSS_860 =
'    .footer-grid{grid-template-columns:1fr 1fr;}\n' +
'    .footer-brand{grid-column:1/-1;}\n';

function renderFooterHTML() {
  return '  <footer>\n' +
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
'  </footer>\n';
}

// ---------------------------------------------------------------------
// Widget de ayuda (estructura; el CSS ya vivía en web/css/help-widget.css,
// enlazado aparte, no embebido en la ficha — no hay CSS que extraer aquí)
// ---------------------------------------------------------------------

function renderHelpWidgetHTML() {
  return '  <div class="help-hub">\n' +
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
'  </div>\n';
}

module.exports = {
  HEADER_CSS_BASE: HEADER_CSS_BASE,
  HEADER_CSS_1180: HEADER_CSS_1180,
  HEADER_CSS_860: HEADER_CSS_860,
  HEADER_SCRIPT: HEADER_SCRIPT,
  renderHeaderHTML: renderHeaderHTML,
  BREADCRUMB_CSS: BREADCRUMB_CSS,
  renderBreadcrumb: renderBreadcrumb,
  FOOTER_CSS_BASE: FOOTER_CSS_BASE,
  FOOTER_CSS_860: FOOTER_CSS_860,
  renderFooterHTML: renderFooterHTML,
  renderHelpWidgetHTML: renderHelpWidgetHTML,
};
