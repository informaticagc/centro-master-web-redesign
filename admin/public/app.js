(function () {
  'use strict';

  // ---- Acceso seguro a localStorage: si no está disponible (modo privado
  // restringido, política del navegador...), el resto del script no debe
  // romperse por una excepción no capturada. ----
  function almacenLeer(clave) {
    try { return localStorage.getItem(clave); } catch (e) { return null; }
  }
  function almacenEscribir(clave, valor) {
    try { localStorage.setItem(clave, valor); } catch (e) { /* sin almacenamiento persistente: se ignora */ }
  }

  // ---- Barra lateral: colapsar (desktop) / abrir-cerrar (móvil) ----
  var shell = document.getElementById('appShell');
  var sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
  var sidebarToggleMobile = document.getElementById('sidebarToggleMobile');
  var sidebarOverlay = document.getElementById('sidebarOverlay');
  if (shell) {
    if (almacenLeer('cem_sidebar_collapsed') === '1') shell.classList.add('is-collapsed');
    if (sidebarCollapseBtn) {
      sidebarCollapseBtn.addEventListener('click', function () {
        shell.classList.toggle('is-collapsed');
        almacenEscribir('cem_sidebar_collapsed', shell.classList.contains('is-collapsed') ? '1' : '0');
      });
    }
    if (sidebarToggleMobile) {
      sidebarToggleMobile.addEventListener('click', function () { shell.classList.add('mobile-nav-open'); });
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', function () { shell.classList.remove('mobile-nav-open'); });
    }
  }

  // ---- Resalta el ítem de navegación activo según la URL actual ----
  document.querySelectorAll('.nav-item[data-nav]').forEach(function (link) {
    var target = link.getAttribute('data-nav');
    var exact = link.getAttribute('data-nav-exact') === 'true';
    var path = window.location.pathname;
    var match = exact ? path === target : (path === target || path.indexOf(target + '/') === 0);
    if (match) link.classList.add('is-active');
  });

  // ---- Menú de acciones por fila (listado/papelera) ----
  // El menú se posiciona con position:fixed calculado en JS (en vez de
  // position:absolute) para que nunca quede recortado por el
  // overflow:hidden de .admin-table, sea cual sea la fila.
  function cerrarMenusFila() {
    document.querySelectorAll('.row-menu.is-open').forEach(function (m) { m.classList.remove('is-open'); });
  }
  document.querySelectorAll('.row-menu').forEach(function (menu) {
    var btn = menu.querySelector('.row-menu-btn');
    var lista = menu.querySelector('.row-menu-list');
    if (!btn || !lista) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = menu.classList.contains('is-open');
      cerrarMenusFila();
      if (!wasOpen) {
        menu.classList.add('is-open');
        var rect = btn.getBoundingClientRect();
        var anchoLista = lista.offsetWidth || 190;
        var izquierda = Math.min(rect.right - anchoLista, window.innerWidth - anchoLista - 8);
        izquierda = Math.max(8, izquierda);
        lista.style.top = (rect.bottom + 4) + 'px';
        lista.style.left = izquierda + 'px';
      }
    });
  });
  document.addEventListener('click', cerrarMenusFila);

  // ---- Cerrar con Escape: menú de fila abierto o, si no hay ninguno, el
  // drawer móvil de la barra lateral. ----
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (document.querySelector('.row-menu.is-open')) {
      cerrarMenusFila();
      return;
    }
    if (shell && shell.classList.contains('mobile-nav-open')) {
      shell.classList.remove('mobile-nav-open');
    }
  });

  // ---- Pestañas del formulario de curso (agrupación visual) ----
  var formTabs = document.querySelectorAll('.form-tab');
  var formTabPanels = document.querySelectorAll('.form-tab-panel');
  function activarPestanaDe(panel) {
    if (!panel) return;
    formTabs.forEach(function (t) { t.classList.remove('is-active'); });
    formTabPanels.forEach(function (p) { p.classList.remove('is-active'); });
    panel.classList.add('is-active');
    var tabBtn = document.querySelector('.form-tab[data-tab-target="' + panel.id + '"]');
    if (tabBtn) tabBtn.classList.add('is-active');
  }
  if (formTabs.length) {
    formTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        activarPestanaDe(document.getElementById(tab.getAttribute('data-tab-target')));
      });
    });

    // Un campo obligatorio inválido en una pestaña no activa queda "fuera
    // de la validación" del navegador porque su panel tiene display:none
    // (así lo define el propio estándar HTML): el navegador bloquea el
    // envío de todas formas pero no puede enfocar ni mostrar aviso sobre
    // un campo no renderizado, así que no pasa nada visible. El formulario
    // lleva "novalidate" para que sea este código quien decida cuándo se
    // dispara la comprobación — pero la comprobación en sí sigue siendo
    // 100% nativa (checkValidity()/:invalid/reportValidity() del propio
    // navegador, sin reglas de validación propias).
    var cursoForm = document.getElementById('curso-form');
    if (cursoForm) {
      cursoForm.addEventListener('submit', function (e) {
        formTabPanels.forEach(function (p) { p.classList.add('form-tab-panel-checking'); });
        var esValido = cursoForm.checkValidity();
        var invalido = esValido ? null : cursoForm.querySelector(':invalid');
        // Marca cada pestaña cuyo panel contiene algún campo inválido: es
        // un reflejo visual del propio estado nativo :invalid del
        // navegador, no una regla de validación propia.
        formTabPanels.forEach(function (p) {
          var tabBtn = document.querySelector('.form-tab[data-tab-target="' + p.id + '"]');
          if (tabBtn) tabBtn.classList.toggle('form-tab-con-error', !esValido && !!p.querySelector(':invalid'));
        });
        formTabPanels.forEach(function (p) { p.classList.remove('form-tab-panel-checking'); });
        if (esValido) {
          // Válido: no se intercepta nada, el propio evento sigue su curso
          // normal (sin reenvíos programáticos, que no son fiables cuando
          // se disparan desde dentro de otro "submit").
          cursoForm.classList.remove('mostrar-invalidos');
          return;
        }
        e.preventDefault();
        cursoForm.classList.add('mostrar-invalidos');
        if (invalido) {
          activarPestanaDe(invalido.closest('.form-tab-panel'));
          // El aviso emergente nativo necesita que el navegador termine de
          // pintar la pestaña recién activada antes de poder anclarse al
          // campo; se intenta igualmente, pero el resaltado en rojo (CSS
          // .mostrar-invalidos :invalid) y el punto en la pestaña no
          // dependen de este tiempo y quedan visibles siempre.
          window.requestAnimationFrame(function () {
            invalido.focus();
            invalido.reportValidity();
          });
        }
      });
    }
  }

  function slugify(texto) {
    return (texto || '')
      .toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  // ---- Slug automático desde el nombre, salvo edición manual ----
  var nombreEl = document.getElementById('campo-nombre');
  var slugEl = document.getElementById('campo-slug');
  if (nombreEl && slugEl) {
    slugEl.addEventListener('input', function () { slugEl.dataset.slugManual = 'true'; });
    nombreEl.addEventListener('input', function () {
      if (slugEl.dataset.slugManual === 'true') return;
      slugEl.value = slugify(nombreEl.value);
    });
  }

  // ---- Listas repetibles ----
  document.querySelectorAll('[data-repeatable]').forEach(function (wrap) {
    var rows = wrap.querySelector('.repeatable-rows');
    var name = wrap.getAttribute('data-name');
    wrap.querySelector('[data-add-row]').addEventListener('click', function () {
      var row = document.createElement('div');
      row.className = 'repeatable-row';
      row.innerHTML = '<input type="text" name="' + name + '[]"><button type="button" class="link-btn link-btn-danger" data-remove-row>×</button>';
      rows.appendChild(row);
      row.querySelector('input').focus();
    });
    rows.addEventListener('click', function (e) {
      if (e.target.matches('[data-remove-row]')) {
        var row = e.target.closest('.repeatable-row');
        if (rows.children.length > 1) row.remove();
        else row.querySelector('input').value = '';
      }
    });
  });

  // ---- Imagen: selección existente + subida nueva ----
  var selectImg = document.getElementById('campo-imagen-select');
  var previewImg = document.getElementById('preview-imagen');
  var uploadInput = document.getElementById('campo-imagen-subida');
  var uploadStatus = document.getElementById('subida-estado');
  var csrfInput = document.querySelector('input[name="_csrf"]');

  function mostrarPreview(rutaRelativaWeb) {
    if (!previewImg) return;
    if (rutaRelativaWeb) {
      previewImg.src = '/preview-site/' + rutaRelativaWeb;
      previewImg.hidden = false;
    } else {
      previewImg.hidden = true;
    }
  }

  if (selectImg) {
    selectImg.addEventListener('change', function () { mostrarPreview(selectImg.value); });
  }

  if (uploadInput) {
    uploadInput.addEventListener('change', function () {
      var file = uploadInput.files[0];
      if (!file) return;
      uploadStatus.textContent = 'Subiendo…';
      var fd = new FormData();
      fd.append('imagen', file);
      fetch('/images/subir', { method: 'POST', body: fd, headers: { 'X-CSRF-Token': csrfInput ? csrfInput.value : '' } })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (!data.ok) { uploadStatus.textContent = 'Error: ' + data.error; return; }
          var opt = document.createElement('option');
          opt.value = 'assets/' + data.filename;
          opt.textContent = data.filename + ' (recién subida)';
          selectImg.appendChild(opt);
          selectImg.value = opt.value;
          mostrarPreview(opt.value);
          uploadStatus.textContent = 'Subida correctamente como ' + data.filename;
          marcarSucio();
        })
        .catch(function () { uploadStatus.textContent = 'Error de red al subir la imagen.'; });
    });
  }

  // ---- Cambios sin guardar ----
  var form = document.querySelector('[data-track-changes]');
  var indicator = document.getElementById('unsaved-indicator');
  var sucio = false;
  function marcarSucio() {
    sucio = true;
    if (indicator) indicator.hidden = false;
  }
  if (form) {
    form.addEventListener('input', marcarSucio);
    form.addEventListener('change', marcarSucio);
    form.addEventListener('submit', function (e) {
      // Si otro listener (validación de pestañas) bloqueó el envío, el
      // guardado no ha ocurrido: no se debe borrar el aviso de cambios
      // sin guardar.
      if (!e.defaultPrevented) sucio = false;
    });
    window.addEventListener('beforeunload', function (e) {
      if (!sucio) return;
      e.preventDefault();
      e.returnValue = '';
    });
    var cancelBtn = form.querySelector('[data-cancel]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function (e) {
        if (sucio && !confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) e.preventDefault();
      });
    }
  }

  // ---- Confirmaciones (archivar/papelera) ----
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ---- Confirmación + motivo (mover a la papelera) ----
  document.querySelectorAll('form[data-confirm-motivo]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!confirm(f.getAttribute('data-confirm-motivo'))) return;
      var motivo = prompt('Motivo (opcional):', '') || '';
      f.querySelector('input[name="motivo"]').value = motivo;
      f.submit();
    });
  });
})();
