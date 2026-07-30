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
const {
  safeHttpOrRelativeURL, safeImageURL, esDescriptorSrcsetValido,
} = require('./lib/url-policy.js');
const { evaluarRecomendaciones } = require('./lib/editorial-rules.js');

const ROOT = path.join(__dirname, '..');
// VALIDATE_DATA_DIR: override opcional (usado por admin/ para validar una
// copia "staged" de cursos.json antes de escribir la real). Sin la env var,
// comportamiento idéntico al de siempre — no afecta a CI ni al uso normal.
const DATA_DIR = process.env.VALIDATE_DATA_DIR ? path.resolve(process.env.VALIDATE_DATA_DIR) : path.join(ROOT, 'web', 'data');
const WEB_DIR = path.join(ROOT, 'web');
const INTERNAL_DIR = path.join(ROOT, 'data-internal');
const INTERNAL_CURSOS_FILE = path.join(INTERNAL_DIR, 'cursos-administrativo.json');

const ESTADOS_VALIDOS = [
  'borrador', 'proximamente', 'matricula-abierta', 'ultimas-plazas',
  'en-curso', 'finalizado', 'archivado',
];
// Estados para los que scripts/build-fichas.js genera una ficha pública en
// /web/cursos/{slug}/. 'borrador' y 'archivado' quedan fuera a propósito.
const ESTADOS_PUBLICABLES = [
  'proximamente', 'matricula-abierta', 'ultimas-plazas', 'en-curso', 'finalizado',
];
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Enums cerrados que ya restringe el <select> del formulario admin
// (admin/config.js) — un valor fuera de esta lista solo puede llegar por
// una edición manual de cursos.json, nunca por el formulario. Duplicadas a
// propósito (scripts/ no depende de admin/); extraerlas a una fuente común
// queda pendiente para otra fase.
const MODALIDADES_VALIDAS = ['presencial', 'teleformacion'];
const TIPOS_PRECIO_VALIDOS = ['gratuito', 'privado'];
// nivel/situacionDestinataria: enums opcionales de baja frecuencia — un
// valor desconocido es solo aviso (ver Fase V2), nunca error.
const NIVELES_VALIDOS = ['nivel-1', 'nivel-2', 'nivel-3'];
const SITUACIONES_DESTINATARIA_VALIDAS = ['desempleado', 'ocupado'];

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

// Campos con significado editorial real, auditados por la estadística
// global de "campos nunca utilizados" (Fase V4B). Lista explícita y fija
// (subconjunto de CAMPOS_RAIZ_CURSO, no derivada de las claves presentes en
// los cursos reales — un campo editorial legítimo ausente en los 4 cursos
// actuales no debe desaparecer silenciosamente de la auditoría). Se
// excluye deliberadamente lo que NO representa una carencia de contenido
// editorial si aparece en 0%:
//  - identificadores/estructurales: id, slug, estado (ya son obligatorios
//    y se validan aparte; 0% en ellos sería un error, no información)
//  - dormidos, sin ningún consumidor hoy (ver informe de auditoría):
//    codigo, precio, prioridadColectivos
//  - técnicos/internos, no son contenido editorial en sí mismos:
//    sedeId (FK a sedes.json), inscripcionAbierta (flag booleano),
//    destacado (flag de Home), orden (ordenación técnica)
//  - generados automáticamente si faltan: urlFicha (usa cursos/{slug}/)
//  - imagen (objeto compuesto, no un campo escalar — sus subcampos no se
//    auditan aquí)
const CAMPOS_AUDITABLES_EDITORIAL = CAMPOS_RAIZ_CURSO.filter((campo) => [
  'id', 'codigo', 'slug', 'imagen', 'sedeId', 'inscripcionAbierta',
  'estado', 'destacado', 'orden', 'urlFicha', 'precio', 'prioridadColectivos',
].indexOf(campo) === -1);

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

// Validación estructural pura: tipo correcto, sin convertir nada. Un string
// numérico como "10" no es un número válido aquí a propósito.
function esNumeroEstructuralmenteValido(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
}
function esBooleanoValido(valor) {
  return typeof valor === 'boolean';
}

const errores = [];
const avisos = [];
// recomendaciones: tercera colección (Fase V4B), objetos estructurados
// {codigo, ref, campo, categoria, mensaje} — nunca bloquean el guardado ni
// el build, nunca se cuentan como error ni como aviso.
const recomendaciones = [];

function err(msg) { errores.push(msg); }
function warn(msg) { avisos.push(msg); }
function recomendar(obj) { recomendaciones.push(obj); }

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

// Resuelve una ruta local (ya validada por la política de URL) dentro de
// /web/, sin permitir que "../" (o un "/" inicial mal interpretado) escape
// del directorio raíz. Devuelve la ruta absoluta resuelta, o null si queda
// fuera de /web/. Se quita cualquier "/" inicial antes de resolver porque
// aquí una ruta como "/assets/x.webp" es relativa a la raíz del sitio
// (/web/), no a la raíz del sistema de archivos — path.resolve() trataría
// un segundo argumento absoluto como una ruta del sistema de archivos e
// ignoraría por completo la base, así que hay que evitarlo explícitamente.
function resolverRutaLocalDentroDeWeb(rutaRelativa) {
  const sinBarraInicial = rutaRelativa.replace(/^\/+/, '');
  const resuelto = path.resolve(WEB_DIR, sinBarraInicial);
  const base = path.resolve(WEB_DIR);
  if (resuelto !== base && resuelto.indexOf(base + path.sep) !== 0) return null;
  return resuelto;
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
// Informativo (Fase V4B), no error/aviso/recomendación — ver más abajo.
let camposNuncaUtilizados = [];
if (cursosData) {
  const cursos = cursosData.cursos || [];
  const estadosPermitidos = cursosData.estadosPermitidos || ESTADOS_VALIDOS;

  const ids = cursos.map((c) => c.id);
  const slugs = cursos.map((c) => c.slug);
  duplicados(ids).forEach((id) => err(`cursos.json: id duplicado "${id}"`));
  duplicados(slugs).forEach((slug) => err(`cursos.json: slug duplicado "${slug}"`));

  // Nombres duplicados (aviso, no error): distintas convocatorias pueden
  // compartir legítimamente el mismo nombre (ver nuevaConvocatoria() en
  // admin/services/curso-model.js). Comparación normalizada (trim +
  // minúsculas) para detectar también variantes como " Curso X " y
  // "curso x". Un solo aviso por grupo duplicado, no uno por curso.
  const gruposPorNombre = {};
  cursos.forEach((c) => {
    if (typeof c.nombre !== 'string') return;
    const clave = c.nombre.trim().toLowerCase();
    if (!clave) return;
    (gruposPorNombre[clave] = gruposPorNombre[clave] || []).push(c.id || '??');
  });
  Object.keys(gruposPorNombre).forEach((clave) => {
    const idsImplicados = gruposPorNombre[clave];
    if (idsImplicados.length > 1) {
      warn(`cursos.json: nombre duplicado (comparación sin mayúsculas ni espacios exteriores) entre ${idsImplicados.map((id) => `"${id}"`).join(', ')}`);
    }
  });

  cursos.forEach((c, i) => {
    const ref = `cursos.json[${i}] (id=${c.id || '??'})`;

    // Campos obligatorios críticos (string no vacía tras trim — un valor
    // de solo espacios no cuenta como presente).
    if (!c.id || typeof c.id !== 'string' || c.id.trim() === '') err(`${ref}: "id" ausente o no es texto`);
    if (!c.slug || typeof c.slug !== 'string' || c.slug.trim() === '') err(`${ref}: "slug" ausente o no es texto`);
    if (!c.nombre || typeof c.nombre !== 'string' || c.nombre.trim() === '') err(`${ref}: "nombre" ausente o no es texto`);
    if (!c.estado || typeof c.estado !== 'string' || c.estado.trim() === '') err(`${ref}: "estado" ausente`);

    // Estado dentro del enum
    if (c.estado && ESTADOS_VALIDOS.indexOf(c.estado) === -1) {
      err(`${ref}: estado "${c.estado}" no está en el enum ${JSON.stringify(ESTADOS_VALIDOS)}`);
    }
    if (c.estado && estadosPermitidos.indexOf(c.estado) === -1 && ESTADOS_VALIDOS.indexOf(c.estado) !== -1) {
      warn(`${ref}: estado "${c.estado}" válido pero no listado en cursos.json.estadosPermitidos`);
    }

    // Campos de texto obligatorios (ya son "required" en el <select>/input
    // del formulario admin — esto cierra el hueco de una edición manual del
    // JSON que se salte esa restricción). Espacios en blanco cuentan como
    // vacío.
    ['isla', 'modalidad', 'tipoPrecio'].forEach((campo) => {
      if (typeof c[campo] !== 'string' || c[campo].trim() === '') {
        err(`${ref}: "${campo}" ausente o vacío`);
      }
    });

    // Enums cerrados (modalidad, tipoPrecio): un valor fuera de la lista
    // solo puede llegar por una edición manual del JSON. Solo se comprueba
    // si el campo ya pasó el chequeo de "obligatorio" de arriba.
    if (typeof c.modalidad === 'string' && c.modalidad.trim() !== '' && MODALIDADES_VALIDAS.indexOf(c.modalidad) === -1) {
      err(`${ref}: modalidad "${c.modalidad}" no está en el enum ${JSON.stringify(MODALIDADES_VALIDAS)}`);
    }
    if (typeof c.tipoPrecio === 'string' && c.tipoPrecio.trim() !== '' && TIPOS_PRECIO_VALIDOS.indexOf(c.tipoPrecio) === -1) {
      err(`${ref}: tipoPrecio "${c.tipoPrecio}" no está en el enum ${JSON.stringify(TIPOS_PRECIO_VALIDOS)}`);
    }

    // nivel: enum opcional — null o ausente es válido y sin aviso. Un valor
    // desconocido es solo aviso (no bloquea el guardado ni el build: la
    // ficha ya omite limpiamente el sufijo de nivel si no lo reconoce).
    if (c.nivel != null && NIVELES_VALIDOS.indexOf(c.nivel) === -1) {
      warn(`${ref}: nivel "${c.nivel}" no está en el enum ${JSON.stringify(NIVELES_VALIDOS)}`);
    }

    // Números: si existen, deben ser number finito y no negativo. Nunca se
    // convierte un string numérico como "10" — es un error, no un dato a
    // normalizar aquí.
    ['duracionHoras', 'plazasDisponibles', 'orden'].forEach((campo) => {
      if (c[campo] != null && !esNumeroEstructuralmenteValido(c[campo])) {
        err(`${ref}: "${campo}" = ${JSON.stringify(c[campo])} debería ser un número finito no negativo, o null`);
      }
    });

    // Booleanos: si existen, deben ser boolean real — "true"/"false" (texto)
    // o 1/0 no cuentan.
    ['inscripcionAbierta', 'destacado'].forEach((campo) => {
      if (c[campo] != null && !esBooleanoValido(c[campo])) {
        err(`${ref}: "${campo}" = ${JSON.stringify(c[campo])} debería ser un booleano, o null`);
      }
    });

    // Referencia sedeId
    if (c.sedeId != null) {
      if (sedeIds.indexOf(c.sedeId) === -1) {
        err(`${ref}: sedeId "${c.sedeId}" no existe en sedes.json`);
      }
    }

    // Imagen: política de URL primero (misma que aplica build-fichas.js en
    // la salida — impide guardar lo que el generador ya descartaría),
    // después existencia local solo para rutas dentro de /web/, nunca para
    // URLs externas (ni peticiones de red).
    if (c.imagen && c.imagen.src) {
      if (typeof c.imagen.src !== 'string' || c.imagen.src.trim() === '') {
        err(`${ref}: "imagen.src" debería ser una URL o ruta de texto no vacía`);
      } else {
        const urlSegura = safeImageURL(c.imagen.src);
        if (!urlSegura) {
          err(`${ref}: "imagen.src" contiene una URL o ruta no permitida: "${c.imagen.src}"`);
        } else if (!/^https?:\/\//i.test(urlSegura)) {
          const resuelto = resolverRutaLocalDentroDeWeb(urlSegura);
          if (!resuelto) {
            err(`${ref}: "imagen.src" queda fuera del directorio "web/": "${c.imagen.src}"`);
          } else if (!fs.existsSync(resuelto)) {
            err(`${ref}: imagen.src no existe en /web/: ${c.imagen.src}`);
          }
        }
      }
    } else {
      err(`${ref}: falta imagen.src`);
    }

    // imagen.srcset: misma política que imagen.src por candidato, más el
    // descriptor. A diferencia de safeSrcset() (protección de salida, que
    // filtra en silencio), aquí CUALQUIER candidato inválido rechaza el
    // campo entero — los datos persistidos deben ser íntegramente válidos.
    if (c.imagen && c.imagen.srcset != null) {
      if (typeof c.imagen.srcset !== 'string' || c.imagen.srcset.trim() === '') {
        err(`${ref}: "imagen.srcset" debería ser una lista de texto no vacía, o null`);
      } else {
        c.imagen.srcset.split(',').forEach((parteBruta) => {
          const candidato = parteBruta.trim();
          if (!candidato) {
            err(`${ref}: "imagen.srcset" contiene un candidato inválido: "${parteBruta}"`);
            return;
          }
          const componentes = candidato.split(/\s+/);
          if (componentes.length !== 2 || !esDescriptorSrcsetValido(componentes[1])) {
            err(`${ref}: "imagen.srcset" contiene un candidato inválido: "${candidato}"`);
            return;
          }
          const urlBruta = componentes[0];
          const urlSegura = safeImageURL(urlBruta);
          if (!urlSegura) {
            err(`${ref}: "imagen.srcset" contiene un candidato inválido: "${candidato}"`);
            return;
          }
          if (!/^https?:\/\//i.test(urlSegura)) {
            const resuelto = resolverRutaLocalDentroDeWeb(urlSegura);
            if (!resuelto) {
              err(`${ref}: el recurso local de "imagen.srcset" queda fuera del directorio "web/": "${urlBruta}"`);
            } else if (!fs.existsSync(resuelto)) {
              err(`${ref}: el recurso local de "imagen.srcset" no existe: "${urlBruta}"`);
            }
          }
        });
      }
    }

    // slug: formato válido (necesario como nombre de directorio y segmento
    // de URL — un slug malformado podría romper build-fichas.js o generar
    // rutas inesperadas).
    if (c.slug && !SLUG_PATTERN.test(c.slug)) {
      err(`${ref}: slug "${c.slug}" no tiene un formato válido (solo minúsculas, números y guiones simples)`);
    }

    // urlFicha: si existe, debe ser una ruta relativa a /web/ (nunca
    // absoluta ni externa), para que Home/catálogo/fichas puedan resolverla
    // igual en local, /design-preview/, raíz o un futuro dominio. Semántica
    // sin cambios en esta fase: no se convierte a la política general de
    // safeHttpOrRelativeURL() porque su regla ("sin '/' inicial") es más
    // estricta que esa política.
    if (c.urlFicha != null) {
      if (typeof c.urlFicha !== 'string' || c.urlFicha === '') {
        err(`${ref}: "urlFicha" debería ser una ruta de texto no vacía, o null`);
      } else if (c.urlFicha.charAt(0) === '/' || /^[a-z]+:\/\//i.test(c.urlFicha)) {
        err(`${ref}: "urlFicha" = "${c.urlFicha}" debe ser una ruta relativa a /web/ (sin "/" inicial ni protocolo)`);
      }
    }

    // urlInscripcion: misma política que build-fichas.js aplica en la
    // salida (safeHttpOrRelativeURL) — impide guardar una URL que el
    // generador ya descartaría. null o ausente sigue siendo válido y sin
    // aviso (dato editorial opcional).
    if (c.urlInscripcion != null) {
      if (typeof c.urlInscripcion !== 'string' || c.urlInscripcion.trim() === '') {
        err(`${ref}: "urlInscripcion" debería ser una URL o ruta de texto no vacía, o null`);
      } else if (!safeHttpOrRelativeURL(c.urlInscripcion)) {
        err(`${ref}: "urlInscripcion" contiene una URL o ruta no permitida: "${c.urlInscripcion}"`);
      }
    }

    // Datos mínimos para que la ficha generada no quede vacía de contenido
    // editorial (esto es un aviso, no bloquea la generación: build-fichas.js
    // ya omite limpiamente cualquier sección sin datos).
    if (ESTADOS_PUBLICABLES.indexOf(c.estado) !== -1 && esVacio(c.descripcionCorta) && esVacio(c.descripcionCompleta)) {
      warn(`${ref}: sin "descripcionCorta" ni "descripcionCompleta" — la ficha se generará sin sección "Sobre este curso"`);
    }

    // Fechas (solo si existen — muchas son null a propósito en esta migración)
    ['fechaInicio', 'fechaFin'].forEach((campo) => {
      if (c[campo] != null && !esFechaValida(c[campo])) {
        err(`${ref}: "${campo}" = "${c[campo]}" no es una fecha ISO válida (YYYY-MM-DD)`);
      }
    });

    // Coherencia fechaInicio/fechaFin (aviso, no error): solo si ambas
    // existen y ya son fechas ISO válidas — si alguna es inválida, ya se
    // reportó como error arriba y no se duplica con este aviso. Formato
    // YYYY-MM-DD: la comparación de strings ya respeta el orden cronológico.
    // fechaInicioAproximada es texto editorial libre y no se interpreta
    // aquí como fecha.
    if (c.fechaInicio != null && c.fechaFin != null && esFechaValida(c.fechaInicio) && esFechaValida(c.fechaFin) && c.fechaInicio > c.fechaFin) {
      warn(`${ref}: "fechaInicio" (${c.fechaInicio}) es posterior a "fechaFin" (${c.fechaFin})`);
    }

    // Tipos de array esperados. prioridadColectivos recibe exactamente la
    // misma validación mínima de tipo que el resto (array + elementos de
    // texto) aunque siga sin consumidor ni semántica de negocio decidida
    // (ver informe) — solo tipo, sin enum, sin duplicados, sin avisos, sin
    // obligatoriedad.
    const CAMPOS_ARRAY_DE_TEXTO = ['situacionDestinataria', 'requisitos', 'documentacionNecesaria', 'modulosUnidadesFormativas', 'prioridadColectivos', 'palabrasClave'];
    CAMPOS_ARRAY_DE_TEXTO.forEach((campo) => {
      if (c[campo] == null) return;
      if (!Array.isArray(c[campo])) { err(`${ref}: "${campo}" debería ser un array`); return; }
      // Cada elemento debe ser texto (aunque sea vacío o solo espacios: esa
      // es una comprobación editorial, no estructural, y queda fuera de esta
      // fase). Un número, booleano u objeto como elemento sí es un error
      // estructural: no es el tipo que espera build-fichas.js.
      c[campo].forEach((elemento, j) => {
        if (typeof elemento !== 'string') {
          err(`${ref}: "${campo}[${j}]" debería ser texto, no ${JSON.stringify(elemento)}`);
        }
      });
    });

    // situacionDestinataria: valores semánticos reconocidos (aviso, no
    // error — dato editorial de baja frecuencia, no bloquea el guardado).
    // No se elimina ni transforma ningún elemento.
    if (Array.isArray(c.situacionDestinataria)) {
      c.situacionDestinataria.forEach((valor) => {
        if (typeof valor === 'string' && SITUACIONES_DESTINATARIA_VALIDAS.indexOf(valor) === -1) {
          warn(`${ref}: situacionDestinataria contiene un valor no reconocido: "${valor}"`);
        }
      });
    }

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

    // Recomendaciones (Fase V4B): oportunidades de mejora editorial/SEO
    // objetivas, nunca error ni aviso — ver scripts/lib/editorial-rules.js.
    evaluarRecomendaciones(c).forEach((r) => {
      recomendar(Object.assign({ ref: c.id || '??' }, r));
    });
  });

  // Estadística global de campos sin uso (Fase V4B): informativa para
  // desarrolladores, no es error/aviso/recomendación y no afecta al código
  // de salida. Se calcula sobre TODOS los cursos de cursos.json, no solo
  // los publicables. "Informado" reutiliza el mismo criterio que esVacio()
  // (null/undefined/array vacío) más string vacía o solo espacios.
  function campoInformado(valor) {
    if (valor === null || valor === undefined) return false;
    if (Array.isArray(valor)) return valor.length > 0;
    if (typeof valor === 'string') return valor.trim() !== '';
    return true;
  }
  camposNuncaUtilizados = cursos.length
    ? CAMPOS_AUDITABLES_EDITORIAL.map((campo) => {
      const informados = cursos.filter((c) => campoInformado(c[campo])).length;
      return { campo, informados, total: cursos.length };
    }).filter((x) => x.informados === 0)
    : [];

  // Colisiones de URL de ficha: cada curso publicable resuelve a
  // urlFicha || "cursos/{slug}/" — dos cursos no pueden resolver a la misma
  // ruta (slugs únicos ya lo garantiza salvo que alguien fije un urlFicha
  // manual que choque con otro).
  const rutasFicha = {};
  cursos.forEach((c) => {
    if (ESTADOS_PUBLICABLES.indexOf(c.estado) === -1 || !c.slug) return;
    const ruta = c.urlFicha || `cursos/${c.slug}/`;
    if (rutasFicha[ruta]) {
      err(`cursos.json: colisión de ruta de ficha "${ruta}" entre "${rutasFicha[ruta]}" y "${c.id}"`);
    } else {
      rutasFicha[ruta] = c.id;
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
// Formato "? " + JSON.stringify(...): a diferencia de errores/avisos (texto
// libre, nunca contiene los caracteres delimitadores usados por su propio
// parser), una recomendación sí puede contener ":", "|" o "·" dentro de
// "mensaje" o "campo" — separar por esos caracteres sería un parser frágil.
// JSON.stringify() ya escapa cualquier carácter problemático (incluidas
// comillas o saltos de línea), así que admin/services/validator.js puede
// extraer la parte tras "? " y aplicar JSON.parse() de forma segura.
console.log(`Recomendaciones: ${recomendaciones.length}`);
recomendaciones.forEach((r) => console.log('  ? ' + JSON.stringify(r)));

if (camposNuncaUtilizados.length) {
  console.log('\nCampos nunca utilizados (informativo, no afecta al resultado):');
  const anchoMax = Math.max.apply(null, camposNuncaUtilizados.map((x) => x.campo.length));
  camposNuncaUtilizados.forEach((x) => {
    console.log('  · ' + x.campo.padEnd(anchoMax, '.') + ' ' + x.informados + '/' + x.total);
  });
}

if (errores.length > 0) {
  console.log('\nRESULTADO: FALLÓ');
  process.exit(1);
} else {
  console.log('\nRESULTADO: OK');
  process.exit(0);
}
