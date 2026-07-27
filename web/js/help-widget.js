/**
 * help-widget.js
 *
 * Controlador genérico del panel flotante "¿Necesitas ayuda?" para páginas
 * que solo necesitan el menú de 3 vías (WhatsApp / asistente / contacto),
 * sin el asistente guiado ni el formulario completos: el catálogo
 * (/web/cursos/) y las fichas de curso (/web/cursos/{slug}/).
 *
 * web/index.html tiene su propio centro de contacto completo (asistente +
 * formulario), con su propia lógica ya corregida (scroll interno, dvh,
 * etc.) — no usa este fichero. Este widget existe para no repetir una
 * tercera vez esa lógica de apertura/cierre/foco/scroll en cada página
 * nueva; el CSS correspondiente vive en /web/css/help-widget.css.
 *
 * Requiere en el HTML: #helpFab (botón) y #helpPanel (contenedor, con
 * tabindex="-1" para poder recibir foco).
 */
(function () {
  'use strict';

  function initHelpWidget() {
    var helpFab = document.getElementById('helpFab');
    var helpPanel = document.getElementById('helpPanel');
    if (!helpFab || !helpPanel) return;

    var lockedScroll = false;

    function openHelp() {
      var isMobile = window.innerWidth <= 860;
      lockedScroll = isMobile;
      if (isMobile) document.body.style.overflow = 'hidden';
      helpPanel.hidden = false;
      helpFab.setAttribute('aria-expanded', 'true');
      helpFab.setAttribute('aria-label', 'Cerrar centro de contacto');
      helpPanel.focus();
    }

    function closeHelp() {
      if (lockedScroll) document.body.style.overflow = '';
      lockedScroll = false;
      helpPanel.hidden = true;
      helpFab.setAttribute('aria-expanded', 'false');
      helpFab.setAttribute('aria-label', '¿Necesitas ayuda? Abrir centro de contacto');
      helpFab.focus();
    }

    helpFab.addEventListener('click', function () {
      if (helpPanel.hidden) openHelp(); else closeHelp();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !helpPanel.hidden) closeHelp();
    });
    document.addEventListener('click', function (e) {
      if (!helpPanel.hidden && !e.target.closest('.help-hub')) closeHelp();
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHelpWidget);
  } else {
    initHelpWidget();
  }
})();
