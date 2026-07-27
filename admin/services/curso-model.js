/**
 * curso-model.js — construye/parsea el objeto Curso desde/hacia el
 * formulario HTML, sin cambiar el esquema existente de cursos.json.
 * Único lugar donde se traduce "campo de formulario" <-> "campo del modelo".
 */
'use strict';
const crypto = require('crypto');

const CAMPOS_ARRAY = ['requisitos', 'documentacionNecesaria', 'modulosUnidadesFormativas', 'prioridadColectivos', 'palabrasClave'];

function nuevoId() {
  return 'curso-' + crypto.randomBytes(4).toString('hex');
}

function toArray(v) {
  if (Array.isArray(v)) return v.map((s) => (s || '').trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function toNullableString(v) {
  const s = (v == null ? '' : String(v)).trim();
  return s === '' ? null : s;
}

function toNullableNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Construye un objeto Curso completo a partir de req.body (formulario). */
function desdeFormulario(body, existente) {
  const base = existente ? Object.assign({}, existente) : plantillaVacia();

  base.codigo = toNullableString(body.codigo);
  base.slug = (body.slug || '').trim();
  base.nombre = (body.nombre || '').trim();
  base.descripcionCorta = toNullableString(body.descripcionCorta);
  base.descripcionCompleta = toNullableString(body.descripcionCompleta);

  base.imagen = {
    src: toNullableString(body.imagenSrc),
    srcset: toNullableString(body.imagenSrcset),
    alt: toNullableString(body.imagenAlt),
    objectPosition: toNullableString(body.imagenObjectPosition),
  };

  base.familiaProfesional = toNullableString(body.familiaProfesional);
  base.situacionDestinataria = toArray(body.situacionDestinataria);
  base.isla = (body.isla || '').trim();
  base.municipio = toNullableString(body.municipio);
  base.sedeId = toNullableString(body.sedeId);
  base.modalidad = (body.modalidad || '').trim();
  base.tipoPrecio = (body.tipoPrecio || '').trim();
  base.precio = toNullableString(body.precio);
  base.requisitos = toArray(body.requisitos);
  base.nivel = toNullableString(body.nivel);
  base.certificacion = toNullableString(body.certificacion);
  base.tipoFormacion = toNullableString(body.tipoFormacion);
  base.duracionHoras = toNullableNumber(body.duracionHoras);
  base.duracionTexto = toNullableString(body.duracionTexto);
  base.fechaInicio = toNullableString(body.fechaInicio);
  base.fechaInicioAproximada = toNullableString(body.fechaInicioAproximada);
  base.fechaFin = toNullableString(body.fechaFin);
  base.horario = toNullableString(body.horario);
  base.ayudasBecas = toNullableString(body.ayudasBecas);
  base.documentacionNecesaria = toArray(body.documentacionNecesaria);
  base.plazasDisponibles = toNullableNumber(body.plazasDisponibles);
  base.inscripcionAbierta = body.inscripcionAbierta === 'on' || body.inscripcionAbierta === true;
  base.urlInscripcion = toNullableString(body.urlInscripcion);
  base.modulosUnidadesFormativas = toArray(body.modulosUnidadesFormativas);
  base.prioridadColectivos = toArray(body.prioridadColectivos);
  base.estado = (body.estado || '').trim();
  base.destacado = body.destacado === 'on' ? true : (existente ? existente.destacado : null);
  base.orden = toNullableNumber(body.orden);
  base.urlFicha = toNullableString(body.urlFicha);
  base.palabrasClave = toArray(body.palabrasClave);

  // Coherencia estado <-> inscripción: un curso finalizado o archivado nunca
  // conserva una CTA de inscripción activa, con independencia de la casilla.
  if (base.estado === 'finalizado' || base.estado === 'archivado') {
    base.inscripcionAbierta = false;
  }

  return base;
}

function plantillaVacia() {
  return {
    id: nuevoId(),
    codigo: null, slug: '', nombre: '', descripcionCorta: null, descripcionCompleta: null,
    imagen: { src: null, srcset: null, alt: null, objectPosition: null },
    familiaProfesional: null, situacionDestinataria: [], isla: '', municipio: null, sedeId: null,
    modalidad: '', tipoPrecio: '', precio: null, requisitos: [], nivel: null, certificacion: null,
    tipoFormacion: null, duracionHoras: null, duracionTexto: null, fechaInicio: null,
    fechaInicioAproximada: null, fechaFin: null, horario: null, ayudasBecas: null,
    documentacionNecesaria: [], plazasDisponibles: null, inscripcionAbierta: false, urlInscripcion: null,
    modulosUnidadesFormativas: [], prioridadColectivos: [], estado: 'borrador', destacado: null,
    orden: null, urlFicha: null, palabrasClave: [],
  };
}

/**
 * Duplica un curso. Documentado explícitamente qué se conserva y qué se
 * limpia (ver informe entregado al usuario):
 *  - CONSERVA: nombre (con sufijo "(copia)"), descripciones, clasificación
 *    (familiaProfesional, isla, municipio, sedeId, modalidad), precio y
 *    ayudas, certificación/nivel/tipoFormacion, contenido (requisitos,
 *    documentación, módulos, palabras clave), imagen.
 *  - LIMPIA: id (nuevo), slug (nuevo), estado -> 'borrador',
 *    inscripcionAbierta -> false, urlInscripcion -> null, fechas
 *    (fechaInicio/fechaFin/fechaInicioAproximada -> null), plazasDisponibles
 *    -> null, destacado -> null, urlFicha -> null (para no colisionar con
 *    la ficha original), orden -> null.
 */
function duplicar(original, cursosExistentes) {
  const { slugUnico } = require('./slug');
  const copia = JSON.parse(JSON.stringify(original));
  copia.id = nuevoId();
  copia.nombre = original.nombre + ' (copia)';
  copia.slug = slugUnico(copia.nombre, cursosExistentes, null);
  copia.estado = 'borrador';
  copia.inscripcionAbierta = false;
  copia.urlInscripcion = null;
  copia.fechaInicio = null;
  copia.fechaFin = null;
  copia.fechaInicioAproximada = null;
  copia.plazasDisponibles = null;
  copia.destacado = null;
  copia.urlFicha = null;
  copia.orden = null;
  return copia;
}

/**
 * Construye (en memoria, SIN GUARDAR) la propuesta de "nueva convocatoria"
 * a partir de un curso finalizado/en-curso/archivado/activo. El usuario
 * debe revisar y confirmar en el formulario antes de que se guarde nada.
 *
 *  - CONSERVA: contenido formativo (descripciones, requisitos, documentación,
 *    módulos, palabras clave), clasificación (familiaProfesional, isla,
 *    municipio, sedeId), modalidad, certificación/nivel/tipoFormacion,
 *    imagen, precio y ayudasBecas (se muestran para que el usuario los
 *    confirme o cambie en el propio formulario — no se guardan solos).
 *  - LIMPIA: id nuevo, slug nuevo, estado -> 'borrador',
 *    inscripcionAbierta -> false, fechaInicio/fechaFin/fechaInicioAproximada
 *    -> null, horario -> null (se asume específico de cada convocatoria),
 *    plazasDisponibles -> null, urlInscripcion -> null, urlFicha -> null,
 *    destacado -> null, orden -> null.
 *
 * Devuelve también `camposARevisar`, los campos que el formulario debe
 * resaltar visualmente para que Secretaría los revise antes de guardar.
 */
function nuevaConvocatoria(original, cursosExistentes) {
  const { slugUnico } = require('./slug');
  const propuesta = JSON.parse(JSON.stringify(original));
  propuesta.id = nuevoId();
  propuesta.slug = slugUnico(original.nombre, cursosExistentes, null);
  propuesta.estado = 'borrador';
  propuesta.inscripcionAbierta = false;
  propuesta.fechaInicio = null;
  propuesta.fechaFin = null;
  propuesta.fechaInicioAproximada = null;
  propuesta.horario = null;
  propuesta.plazasDisponibles = null;
  propuesta.urlInscripcion = null;
  propuesta.urlFicha = null;
  propuesta.destacado = null;
  propuesta.orden = null;

  const camposARevisar = ['nombre', 'slug', 'fechaInicio', 'horario', 'sedeId', 'plazasDisponibles', 'precio', 'ayudasBecas', 'urlInscripcion', 'estado'];
  return { propuesta, camposARevisar };
}

module.exports = { nuevoId, desdeFormulario, plantillaVacia, duplicar, nuevaConvocatoria, CAMPOS_ARRAY };
