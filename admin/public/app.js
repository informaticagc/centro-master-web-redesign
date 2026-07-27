(function () {
  'use strict';

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
    form.addEventListener('submit', function () { sucio = false; });
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
