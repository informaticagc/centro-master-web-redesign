#!/usr/bin/env node
/**
 * scripts/validate-data.js
 *
 * Valida /web/data/*.json antes de confiar en ellos. No modifica nada.
 * Uso: node scripts/validate-data.js
 * Sale con código 0 si todo es correcto, 1 si hay algún error.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'web', 'data');
const WEB_DIR = path.join(ROOT, 'web');
const INTERNAL_DIR = path.join(ROOT, 'data-internal');
const INTERNAL_CURSOS_FILE = path.join(INTERNAL_DIR, 'cursos-administrativo.json');

const ESTADOS_VALIDOS = [
  'borrador', 'proximamente', 'matricula-abierta', 'ultimas-plazas',
  'en-curso', 'finalizado', 'archivado',
];

// Campos válidos del modelo público de Curso (web/data/cursos.json), para
// poder comprobar que 'pendientesVerificacion' (que ahora vive en
// data-internal/cursos-administrativo.json) no referencia un nombre de campo
// inexistente (p.ej. por una errata). 'administrativo' y 'origenLegacy' YA
// NO son campos válidos aquí — si aparecen en el JSON público es un error
// de arquitectura, no un dato interno legítimo (ver más abajo).
const CAMPOS_RAIZ_CURSO = [
  'id', 'codigo', 'slug', 'nombre', 'descripcionCorta', 'descripcionCompleta',
  'imagen', 'familiaProfesional', 'situacionDestinataria', 'isla', 'municipio',
  'sedeId', 'modalidad', 'tipoPrecio', 'precio', 'requisitos', 'nivel',
  'certificacion', 'tipoFormacion', 'duracionHoras', 'duracionTexto', 'fechaInicio',
  'fechaInicioAproximada', 'fechaFin', 'horario', 'ayudasBecas',
  'documentacionNecesaria', 'plazasDisponibles', 'inscripcionAbierta',
  'urlInscripcion', 'modulosUnidadesFormativas', 'prioridadColectivos',
  'estado', 'destacado', 'orden', 'urlFicha', 'palabrasClave',
];
// Campos que ya NO deben existir en el JSON público — moverse a
// data-internal/ si reaparecen.
const CAMPOS_PROHIBIDOS_EN_PUBLICO = ['administrativo', 'origenLegacy'];
const CAMPOS_ADMINISTRATIVO_CURSO = [
  'convocatoriaPrograma', 'entidadFinanciadora', 'numeroExpediente',
  'plazasTotal', 'metadatos', 'pendientesVerificacion',
];

// Campos que, si están vacíos (null o array vacío), deberían aparecer en
// 'pendientesVerificacion' salvo que el propio curso ya lo declare como tal.
// No es una lista exhaustiva de todo lo que puede ser null (algunos campos
// son legítimamente N/A, no "pendientes"): es la lista de campos que
// importan para que el buscador/asistente den resultados fiables.
const CAMPOS_CRITICOS_SI_VACIOS = [
  'situacionDestinataria', 'requisitos', 'sedeId', 'municipio',
  'fechaInicio', 'descripcionCorta', 'descripcionCompleta', 'urlFicha',
];

function esNombreDeCampoValido(nombre) {
  if (CAMPOS_RAIZ_CURSO.indexOf(nombre) !== -1) return true;
  if (nombre.indexOf('administrativo.') === 0) {
    return CAMPOS_ADMINISTRATIVO_CURSO.indexOf(nombre.slice('administrativo.'.length)) !== -1;
  }
  return false;
}

function esVacio(valor) {
  return valor === null || valor === undefined || (Array.isArray(valor) && valor.length === 0);
}

const errores = [];
const avisos = [];

function err(msg) { errores.push(msg); }
function warn(msg) { avisos.push(msg); }

function leerJson(nombreArchivo) {
  const p = path.join(DATA_DIR, nombreArchivo);
  if (!fs.existsSync(p)) {
    err(`Falta el archivo: web/data/${nombreArchivo}`);
    return null;
  }
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    err(`JSON inválido en web/data/${nombreArchivo}: ${e.message}`);
    return null;
  }
}

function esFechaValida(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

function archivoExiste(rutaRelativaAWeb) {
  return fs.existsSync(path.join(WEB_DIR, rutaRelativaAWeb));
}

function duplicados(lista) {
  const vistos = new Set();
  const dups = new Set();
  lista.forEach((v) => {
    if (vistos.has(v)) dups.add(v);
    vistos.add(v);
  });
  return Array.from(dups);
}

// ---------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------
const cursosData = leerJson('cursos.json');
const sedesData = leerJson('sedes.json');
const conocimientoData = leerJson('conocimiento.json');
const faqData = leerJson('faq.json');
const sinonimosData = leerJson('sinonimos.json');

// ---------------------------------------------------------------------
// data-internal/cursos-administrativo.json (opcional — no existe en CI)
// ---------------------------------------------------------------------
// Contiene 'administrativo' (incluye pendientesVerificacion) por curso,
// fuera de git (ver .gitignore y /data-internal/README.md). Su ausencia
// NUNCA debe hacer fallar la validación: solo se omiten los avisos que
// dependen de él.
let internalCursosData = null;
let pendientesVerificacionPorCurso = null;
if (fs.existsSync(INTERNAL_CURSOS_FILE)) {
  const raw = fs.readFileSync(INTERNAL_CURSOS_FILE, 'utf8');
  try {
    internalCursosData = JSON.parse(raw);
  } catch (e) {
    err(`JSON inválido en data-internal/cursos-administrativo.json: ${e.message}`);
  }
  if (internalCursosData) {
    pendientesVerificacionPorCurso = {};
    const entradas = internalCursosData.cursos || [];
    duplicados(entradas.map((e) => e.id)).forEach((id) => err(`data-internal/cursos-administrativo.json: id duplicado "${id}"`));
    entradas.forEach((entrada, i) => {
      const ref = `data-internal/cursos-administrativo.json[${i}] (id=${entrada.id || '??'})`;
      if (!entrada.id) { err(`${ref}: falta "id"`); return; }
      const admin = entrada.administrativo;
      if (admin === undefined) {
        warn(`${ref}: no tiene bloque "administrativo"`);
      } else if (typeof admin !== 'object' || admin === null || Array.isArray(admin)) {
        err(`${ref}: "administrativo" debería ser un objeto`);
      } else {
        const pv = admin.pendientesVerificacion;
        if (pv === undefined) {
          warn(`${ref}: administrativo.pendientesVerificacion no está definido`);
        } else if (!Array.isArray(pv)) {
          err(`${ref}: administrativo.pendientesVerificacion debería ser un array`);
        } else {
          pendientesVerificacionPorCurso[entrada.id] = pv;
          pv.forEach((nombreCampo) => {
            if (typeof nombreCampo !== 'string') {
              err(`${ref}: administrativo.pendientesVerificacion contiene un valor no textual: ${JSON.stringify(nombreCampo)}`);
            } else if (!esNombreDeCampoValido(nombreCampo)) {
              err(`${ref}: administrativo.pendientesVerificacion referencia el campo desconocido "${nombreCampo}" (no existe en el modelo público de Curso)`);
            }
          });
        }
      }
    });
  }
} else {
  warn('data-internal/cursos-administrativo.json no encontrado localmente — se omite el cruce de "pendientesVerificacion" con los campos críticos vacíos (normal en CI).');
}

// ---------------------------------------------------------------------
// sedes.json
// ---------------------------------------------------------------------
let sedeIds = [];
if (sedesData) {
  const sedes = sedesData.sedes || [];
  sedeIds = sedes.map((s) => s.id);

  duplicados(sedeIds).forEach((id) => err(`sedes.json: id duplicado "${id}"`));

  sedes.forEach((s, i) => {
    const ref = `sedes.json[${i}] (id=${s.id || '??'})`;
    if (!s.id) err(`${ref}: falta "id"`);
    if (!s.municipio) err(`${ref}: falta "municipio"`);
    if (!s.direccion) err(`${ref}: falta "direccion"`);
    if (s.imagen && s.imagen.src) {
      if (!archivoExiste(s.imagen.src)) err(`${ref}: imagen.src no existe en /web/: ${s.imagen.src}`);
    } else {
      warn(`${ref}: sin imagen.src`);
    }
  });
}

// ---------------------------------------------------------------------
// cursos.json
// ---------------------------------------------------------------------
if (cursosData) {
  const cursos = cursosData.cursos || [];
  const estadosPermitidos = cursosData.estadosPermitidos || ESTADOS_VALIDOS;

  const ids = cursos.map((c) => c.id);
  const slugs = cursos.map((c) => c.slug);
  duplicados(ids).forEach((id) => err(`cursos.json: id duplicado "${id}"`));
  duplicados(slugs).forEach((slug) => err(`cursos.json: slug duplicado "${slug}"`));

  cursos.forEach((c, i) => {
    const ref = `cursos.json[${i}] (id=${c.id || '??'})`;

    // Campos obligatorios críticos
    if (!c.id || typeof c.id !== 'string') err(`${ref}: "id" ausente o no es texto`);
    if (!c.slug || typeof c.slug !== 'string') err(`${ref}: "slug" ausente o no es texto`);
    if (!c.nombre || typeof c.nombre !== 'string') err(`${ref}: "nombre" ausente o no es texto`);
    if (!c.estado) err(`${ref}: "estado" ausente`);

    // Estado dentro del enum
    if (c.estado && ESTADOS_VALIDOS.indexOf(c.estado) === -1) {
      err(`${ref}: estado "${c.estado}" no está en el enum ${JSON.stringify(ESTADOS_VALIDOS)}`);
    }
    if (c.estado && estadosPermitidos.indexOf(c.estado) === -1 && ESTADOS_VALIDOS.indexOf(c.estado) !== -1) {
      warn(`${ref}: estado "${c.estado}" válido pero no listado en cursos.json.estadosPermitidos`);
    }

    // Referencia sedeId
    if (c.sedeId != null) {
      if (sedeIds.indexOf(c.sedeId) === -1) {
        err(`${ref}: sedeId "${c.sedeId}" no existe en sedes.json`);
      }
    }

    // Imagen
    if (c.imagen && c.imagen.src) {
      if (!archivoExiste(c.imagen.src)) err(`${ref}: imagen.src no existe en /web/: ${c.imagen.src}`);
    } else {
      err(`${ref}: falta imagen.src`);
    }

    // Fechas (solo si existen — muchas son null a propósito en esta migración)
    ['fechaInicio', 'fechaFin'].forEach((campo) => {
      if (c[campo] != null && !esFechaValida(c[campo])) {
        err(`${ref}: "${campo}" = "${c[campo]}" no es una fecha ISO válida (YYYY-MM-DD)`);
      }
    });

    // Tipos de array esperados
    ['situacionDestinataria', 'requisitos', 'documentacionNecesaria', 'modulosUnidadesFormativas', 'prioridadColectivos', 'palabrasClave'].forEach((campo) => {
      if (c[campo] !== undefined && !Array.isArray(c[campo])) {
        err(`${ref}: "${campo}" debería ser un array`);
      }
    });

    // Separación pública/interna: el JSON público NUNCA debe volver a traer
    // 'administrativo' ni 'origenLegacy' — ese contenido vive en
    // data-internal/cursos-administrativo.json (fuera de git).
    CAMPOS_PROHIBIDOS_EN_PUBLICO.forEach((campo) => {
      if (c[campo] !== undefined) {
        err(`${ref}: "${campo}" no debe existir en web/data/cursos.json (dato interno) — mover a data-internal/cursos-administrativo.json`);
      }
    });

    // Campos críticos vacíos que no están declarados como pendientes de
    // verificación: solo se puede comprobar si data-internal está presente
    // localmente (pendientesVerificacionPorCurso, ver más abajo).
    if (pendientesVerificacionPorCurso) {
      const pendientes = pendientesVerificacionPorCurso[c.id] || [];
      CAMPOS_CRITICOS_SI_VACIOS.forEach((campo) => {
        if (esVacio(c[campo]) && pendientes.indexOf(campo) === -1) {
          warn(`${ref}: "${campo}" está vacío pero no aparece en administrativo.pendientesVerificacion (data-internal)`);
        }
      });
    }
  });

  // Cruce data-internal → cursos.json: toda entrada interna debe referenciar
  // un curso público real (si no, es basura o quedó huérfana tras un borrado).
  if (internalCursosData) {
    (internalCursosData.cursos || []).forEach((entrada) => {
      if (entrada.id && ids.indexOf(entrada.id) === -1) {
        warn(`data-internal/cursos-administrativo.json: id "${entrada.id}" no existe en web/data/cursos.json`);
      }
    });
  }
}

// ---------------------------------------------------------------------
// conocimiento.json
// ---------------------------------------------------------------------
if (conocimientoData) {
  const temas = conocimientoData.temas || [];
  const temaIds = temas.map((t) => t.id);
  duplicados(temaIds).forEach((id) => err(`conocimiento.json: id de tema duplicado "${id}"`));
  temas.forEach((t, i) => {
    const ref = `conocimiento.json[${i}] (id=${t.id || '??'})`;
    if (!t.id) err(`${ref}: falta "id"`);
    if (!t.titulo) err(`${ref}: falta "titulo"`);
    if (t.pendiente === undefined) err(`${ref}: falta el booleano "pendiente"`);
    if (t.pendiente === false && !t.resumen) err(`${ref}: marcado pendiente=false pero "resumen" está vacío`);
    if (t.pendiente === true && t.resumen) warn(`${ref}: marcado pendiente=true pero tiene "resumen" — revisar si ya no está pendiente`);
  });
}

// ---------------------------------------------------------------------
// faq.json
// ---------------------------------------------------------------------
if (faqData) {
  const faqs = faqData.faqs || [];
  const faqIds = faqs.map((f) => f.id);
  duplicados(faqIds).forEach((id) => err(`faq.json: id duplicado "${id}"`));
  faqs.forEach((f, i) => {
    const ref = `faq.json[${i}] (id=${f.id || '??'})`;
    if (!f.id) err(`${ref}: falta "id"`);
    if (!f.respuesta) err(`${ref}: falta "respuesta"`);
    if (!Array.isArray(f.preguntasEjemplo) || f.preguntasEjemplo.length === 0) {
      err(`${ref}: "preguntasEjemplo" debe ser un array no vacío`);
    }
  });
}

// ---------------------------------------------------------------------
// sinonimos.json
// ---------------------------------------------------------------------
if (sinonimosData) {
  ['islas', 'modalidad', 'situacion'].forEach((campo) => {
    if (typeof sinonimosData[campo] !== 'object' || sinonimosData[campo] === null) {
      err(`sinonimos.json: falta o es inválido el diccionario "${campo}"`);
    }
  });
}

// ---------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------
console.log('--- Validación de /web/data ---');
console.log(`Errores: ${errores.length}`);
errores.forEach((e) => console.log('  ✗ ' + e));
console.log(`Avisos: ${avisos.length}`);
avisos.forEach((a) => console.log('  ! ' + a));

if (errores.length > 0) {
  console.log('\nRESULTADO: FALLÓ');
  process.exit(1);
} else {
  console.log('\nRESULTADO: OK');
  process.exit(0);
}
