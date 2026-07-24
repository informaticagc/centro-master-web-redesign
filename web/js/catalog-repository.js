/**
 * catalog-repository.js
 *
 * Única puerta de entrada a los datos del catálogo (cursos, sedes, base de
 * conocimiento, FAQ, sinónimos). Nadie más (Home, buscador, asistente) debe
 * leer los JSON directamente: todos pasan por esta API.
 *
 * web/data/cursos.json es un fichero público servido tal cual por HTTP
 * (GitHub Pages, o cualquier fetch directo): NO debe contener nunca campos
 * internos (bloque 'administrativo', trazabilidad 'origenLegacy', etc.) —
 * ese contenido vive en /data-internal/ (fuera de git, ver
 * /data-internal/README.md). Por eso esta capa ya no necesita ninguna
 * lógica de "quitar campos internos de la respuesta": si algún día vuelve a
 * aparecer un campo interno en el JSON público, es un error en los datos,
 * no algo que este módulo deba enmascarar en tiempo de ejecución.
 *
 * Hoy el origen de datos son ficheros JSON estáticos bajo /web/data/. El día
 * de mañana ese origen puede cambiar (API HTTP, SharePoint, base de datos)
 * sustituyendo únicamente las funciones internas de carga (_loadRaw) — la
 * API pública (getAll, getById, search, ...) no cambia, así que ningún
 * consumidor (Home.dc.html, web/index.html, el asistente) necesita tocarse.
 *
 * Carga de rutas: la ubicación de /web/data/ se calcula relativa a la
 * ubicación del propio script (document.currentScript), nunca relativa a la
 * página que lo incluye. Así funciona sin cambios tanto en la raíz del
 * dominio como bajo /centro-master-web-redesign/ o
 * /centro-master-web-redesign/design-preview/ — y también tras un futuro
 * cambio de dominio, mientras /web/js/ y /web/data/ mantengan su posición
 * relativa entre sí.
 *
 * No es un módulo ES: se expone como global `window.CatalogRepository`
 * (mismo patrón de script clásico que ya usa image-slot.js en este
 * proyecto) para poder cargarse con un <script> normal sin bundler. También
 * funciona bajo Node (CommonJS) para el script de validación de datos.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CatalogRepository = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Debe capturarse aquí, en la ejecución síncrona inicial del propio módulo:
  // document.currentScript solo apunta a este <script> mientras se está
  // evaluando; en cualquier llamada posterior a la API (getAll, search...),
  // que ocurre desde el script del consumidor, currentScript ya sería el de
  // ese consumidor (o null), no el de catalog-repository.js.
  var _selfScriptSrc = (typeof document !== 'undefined' && document.currentScript)
    ? document.currentScript.src
    : null;

  var DATA_FILES = {
    cursos: 'cursos.json',
    sedes: 'sedes.json',
    conocimiento: 'conocimiento.json',
    faq: 'faq.json',
    sinonimos: 'sinonimos.json',
  };

  // Estados que se consideran "oferta pública" salvo que se pida lo contrario
  // explícitamente. Debe coincidir con cursos.json:estadosPublicos, pero se
  // declara aquí también como salvaguarda si algún día el JSON no lo trae.
  var DEFAULT_PUBLIC_STATES = ['proximamente', 'matricula-abierta', 'ultimas-plazas', 'en-curso'];

  var _cache = null; // { cursos, sedes, conocimiento, faq, sinonimos }
  var _loadingPromise = null;
  var _baseUrlOverride = null;

  /** Permite fijar manualmente la carpeta /data/ (tests en Node, u otro origen futuro). */
  function setBaseUrl(url) {
    _baseUrlOverride = url;
    resetCache();
  }

  function resolveDataBaseUrl() {
    if (_baseUrlOverride) return _baseUrlOverride;
    if (_selfScriptSrc) {
      return new URL('../data/', _selfScriptSrc).href;
    }
    // Fallback Node / entorno sin document.currentScript (p.ej. import dinámico).
    return './data/';
  }

  function _readJsonFile(absPath) {
    // Node (CommonJS) — usado por el script de validación y por tests.
    var fs = require('fs');
    return JSON.parse(fs.readFileSync(absPath, 'utf8'));
  }

  // El modo de carga se decide por la presencia de `document` (navegador),
  // no por la presencia de `fetch`: Node 18+ ya incluye un `fetch` global,
  // así que comprobar solo `fetch` no distingue fiablemente los dos
  // entornos. Sin `document` no hay forma de anclar rutas relativas a
  // document.currentScript, así que se trata como entorno Node/test y se
  // lee del sistema de ficheros.
  var IS_NODE_FS_MODE = typeof document === 'undefined';

  function _fetchJson(url) {
    if (!IS_NODE_FS_MODE && typeof fetch === 'function') {
      return fetch(url).then(function (res) {
        if (!res.ok) throw new Error('No se pudo cargar ' + url + ' (HTTP ' + res.status + ')');
        return res.json();
      });
    }
    // Entorno Node (script de validación/tests): interpreta url como ruta de fichero.
    return Promise.resolve(_readJsonFile(url));
  }

  function _loadRaw() {
    if (_loadingPromise) return _loadingPromise;
    var base = resolveDataBaseUrl();
    var isNodeFsMode = IS_NODE_FS_MODE;
    var path = isNodeFsMode ? require('path') : null;

    function urlFor(file) {
      if (isNodeFsMode) return path.join(base, file);
      return new URL(file, base).href;
    }

    _loadingPromise = Promise.all([
      _fetchJson(urlFor(DATA_FILES.cursos)),
      _fetchJson(urlFor(DATA_FILES.sedes)),
      _fetchJson(urlFor(DATA_FILES.conocimiento)),
      _fetchJson(urlFor(DATA_FILES.faq)),
      _fetchJson(urlFor(DATA_FILES.sinonimos)),
    ]).then(function (results) {
      _cache = {
        cursos: results[0],
        sedes: results[1],
        conocimiento: results[2],
        faq: results[3],
        sinonimos: results[4],
      };
      return _cache;
    }).catch(function (err) {
      _loadingPromise = null; // permite reintentar si falló
      throw err;
    });
    return _loadingPromise;
  }

  function load() {
    if (_cache) return Promise.resolve(_cache);
    return _loadRaw();
  }

  /** Limpia la caché en memoria — útil en tests o si los datos cambian en caliente. */
  function resetCache() {
    _cache = null;
    _loadingPromise = null;
  }

  function _publicStates(data) {
    return (data.cursos && data.cursos.estadosPublicos) || DEFAULT_PUBLIC_STATES;
  }

  function _normalize(str) {
    return (str || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * getAll() → todos los cursos del origen público, cualquiera que sea su
   * estado (incluye 'borrador'/'archivado'). El origen (web/data/cursos.json)
   * ya no contiene ningún campo interno — no hay nada que filtrar aquí. La
   * UI pública normal debería usar getPublicCourses(), no esto.
   */
  function getAll() {
    return load().then(function (data) {
      return (data.cursos.cursos || []).slice();
    });
  }

  function getPublicCourses() {
    return load().then(function (data) {
      var estadosPublicos = _publicStates(data);
      return (data.cursos.cursos || [])
        .filter(function (c) { return estadosPublicos.indexOf(c.estado) !== -1; });
    });
  }

  function getById(id) {
    return getAll().then(function (cursos) {
      return cursos.find(function (c) { return c.id === id; }) || null;
    });
  }

  function getBySlug(slug) {
    return getAll().then(function (cursos) {
      return cursos.find(function (c) { return c.slug === slug; }) || null;
    });
  }

  function getFeatured() {
    return getPublicCourses().then(function (cursos) {
      return cursos
        .filter(function (c) { return c.destacado === true; })
        .sort(function (a, b) { return (a.orden || 0) - (b.orden || 0); });
    });
  }

  /**
   * search(filtros) — misma función que deberán usar el buscador de la Home
   * Y el asistente (fase futura), para garantizar resultados idénticos.
   *
   * filtros: {
   *   texto,            // string libre, se compara contra nombre/palabrasClave/descripcionCorta
   *   isla,             // 'todas' o nombre exacto de isla
   *   situacion,        // 'todas' o valor incluido en situacionDestinataria
   *   modalidad,        // 'todas' o valor exacto de modalidad
   *   familiaProfesional,
   *   tipoPrecio,       // 'gratuito' | 'privado'
   *   estadosPermitidos // array de estados a incluir; por defecto, los públicos
   * }
   */
  function search(filtros) {
    filtros = filtros || {};
    return load().then(function (data) {
      var estadosPermitidos = filtros.estadosPermitidos || _publicStates(data);
      var texto = filtros.texto ? _normalize(filtros.texto) : '';

      return (data.cursos.cursos || [])
        .filter(function (c) { return estadosPermitidos.indexOf(c.estado) !== -1; })
        .filter(function (c) {
          if (!texto) return true;
          var haystack = [c.nombre, c.descripcionCorta]
            .concat(c.palabrasClave || [])
            .filter(Boolean)
            .map(_normalize)
            .join(' ');
          return haystack.indexOf(texto) !== -1;
        })
        .filter(function (c) {
          if (!filtros.isla || filtros.isla === 'todas') return true;
          return c.isla === filtros.isla;
        })
        .filter(function (c) {
          if (!filtros.situacion || filtros.situacion === 'todas') return true;
          return (c.situacionDestinataria || []).indexOf(filtros.situacion) !== -1;
        })
        .filter(function (c) {
          if (!filtros.modalidad || filtros.modalidad === 'todas') return true;
          return c.modalidad === filtros.modalidad;
        })
        .filter(function (c) {
          if (!filtros.familiaProfesional || filtros.familiaProfesional === 'todas') return true;
          return c.familiaProfesional === filtros.familiaProfesional;
        })
        .filter(function (c) {
          if (!filtros.tipoPrecio) return true;
          return c.tipoPrecio === filtros.tipoPrecio;
        });
    });
  }

  function getSedes() {
    return load().then(function (data) { return (data.sedes.sedes || []).slice(); });
  }

  function getSedeById(id) {
    return getSedes().then(function (sedes) {
      return sedes.find(function (s) { return s.id === id; }) || null;
    });
  }

  function getConocimientoTema(id) {
    return load().then(function (data) {
      return (data.conocimiento.temas || []).find(function (t) { return t.id === id; }) || null;
    });
  }

  function getConocimiento() {
    return load().then(function (data) { return (data.conocimiento.temas || []).slice(); });
  }

  function getFaqs() {
    return load().then(function (data) { return (data.faq.faqs || []).slice(); });
  }

  function getSinonimos() {
    return load().then(function (data) { return data.sinonimos; });
  }

  return {
    // Cursos
    getAll: getAll,
    getById: getById,
    getBySlug: getBySlug,
    search: search,
    getFeatured: getFeatured,
    getPublicCourses: getPublicCourses,
    // Sedes
    getSedes: getSedes,
    getSedeById: getSedeById,
    // Conocimiento / FAQ / sinónimos
    getConocimiento: getConocimiento,
    getConocimientoTema: getConocimientoTema,
    getFaqs: getFaqs,
    getSinonimos: getSinonimos,
    // Utilidades / configuración (tests, futura administración)
    setBaseUrl: setBaseUrl,
    resetCache: resetCache,
    load: load,
  };
});
