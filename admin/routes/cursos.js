'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const cfg = require('../config');
const store = require('../services/cursos-store');
const model = require('../services/curso-model');
const slugSvc = require('../services/slug');
const images = require('../services/images');
const { runBuildFichas } = require('../services/builder');
const trash = require('../services/trash');
const historial = require('../services/historial');
const lock = require('../services/lock');

const router = express.Router();

function sedesDisponibles() {
  try {
    return JSON.parse(fs.readFileSync(cfg.SEDES_JSON, 'utf8')).sedes || [];
  } catch (e) {
    return [];
  }
}

function fichaManaged(slug) {
  const f = path.join(cfg.WEB_DIR, 'cursos', slug, 'index.html');
  if (!fs.existsSync(f)) return false;
  return fs.readFileSync(f, 'utf8').indexOf('<!-- build-fichas:managed -->') !== -1;
}

// ---------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------
router.get('/', (req, res) => {
  const data = store.leerCursosData();
  const q = (req.query.q || '').toLowerCase().trim();
  const estadoFiltro = req.query.estado || 'todos';

  let cursos = data.cursos.slice();
  if (q) cursos = cursos.filter((c) => (c.nombre || '').toLowerCase().includes(q) || (c.slug || '').toLowerCase().includes(q));
  if (estadoFiltro !== 'todos') cursos = cursos.filter((c) => c.estado === estadoFiltro);

  cursos = cursos.map((c) => Object.assign({}, c, {
    _publicada: cfg.ESTADOS_PUBLICABLES.includes(c.estado),
    _eliminable: c.estado === 'borrador' && !fichaManaged(c.slug),
    _puedeNuevaConvocatoria: ['finalizado', 'en-curso', 'archivado', 'proximamente', 'matricula-abierta', 'ultimas-plazas'].includes(c.estado),
  }));

  res.render('list', {
    titulo: 'Cursos', cursos, q, estadoFiltro, estados: cfg.ESTADOS,
    flash: req.session.flash || null,
  });
  req.session.flash = null;
});

// ---------------------------------------------------------------------
// Nuevo / editar (formulario)
// ---------------------------------------------------------------------
router.get('/nuevo', (req, res) => {
  res.render('form', {
    titulo: 'Nuevo curso', curso: model.plantillaVacia(), esNuevo: true,
    sedes: sedesDisponibles(), assets: images.listarAssets(), cfg, errores: [], avisos: [],
    camposARevisar: [],
  });
});

router.get('/:id/editar', (req, res) => {
  const data = store.leerCursosData();
  const curso = data.cursos.find((c) => c.id === req.params.id);
  if (!curso) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Curso no encontrado.' });
  res.render('form', {
    titulo: 'Editar curso', curso, esNuevo: false,
    sedes: sedesDisponibles(), assets: images.listarAssets(), cfg, errores: [], avisos: [],
    yaPublicado: fichaManaged(curso.slug), camposARevisar: [],
  });
});

// ---------------------------------------------------------------------
// Nueva convocatoria: solo PROPONE en el formulario, no guarda nada.
// ---------------------------------------------------------------------
router.post('/:id/nueva-convocatoria', (req, res) => {
  const data = store.leerCursosData();
  const original = data.cursos.find((c) => c.id === req.params.id);
  if (!original) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Curso no encontrado.' });

  const { propuesta, camposARevisar } = model.nuevaConvocatoria(original, data.cursos);
  res.render('form', {
    titulo: 'Nueva convocatoria', curso: propuesta, esNuevo: true,
    sedes: sedesDisponibles(), assets: images.listarAssets(), cfg, errores: [],
    avisos: ['Revisa y confirma los campos resaltados antes de guardar — todavía no se ha guardado nada.'],
    camposARevisar,
  });
});

// ---------------------------------------------------------------------
// Guardar (crear o actualizar)
// ---------------------------------------------------------------------
router.post('/guardar/:id', async (req, res) => {
  const data = store.leerCursosData();
  const esNuevo = req.params.id === 'nuevo';
  const existente = esNuevo ? null : data.cursos.find((c) => c.id === req.params.id);
  if (!esNuevo && !existente) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Curso no encontrado.' });

  const curso = model.desdeFormulario(req.body, existente);

  const erroresForm = [];
  if (!curso.nombre) erroresForm.push('El nombre es obligatorio.');
  if (!curso.slug) erroresForm.push('El slug es obligatorio.');
  else if (!slugSvc.esSlugValido(curso.slug)) erroresForm.push('El slug solo puede contener minúsculas, números y guiones simples.');
  else {
    const colisiona = data.cursos.some((c) => c.slug === curso.slug && c.id !== curso.id);
    if (colisiona) erroresForm.push('Ya existe otro curso con ese slug.');
  }
  if (!cfg.ESTADOS.includes(curso.estado)) erroresForm.push('Estado no válido.');
  if (cfg.ESTADOS_PUBLICABLES.includes(curso.estado) && (!curso.nombre || !curso.slug)) {
    erroresForm.push('Un curso publicable necesita nombre y slug.');
  }

  if (erroresForm.length) {
    return res.status(400).render('form', {
      titulo: esNuevo ? 'Nuevo curso' : 'Editar curso', curso, esNuevo,
      sedes: sedesDisponibles(), assets: images.listarAssets(), cfg,
      errores: erroresForm, avisos: [], camposARevisar: [],
      yaPublicado: !esNuevo && fichaManaged(existente.slug),
    });
  }

  const resultadoLock = await lock.conBloqueo('catalogo', req.session.usuario, async () => {
    const cursosNuevos = esNuevo
      ? data.cursos.concat([curso])
      : data.cursos.map((c) => (c.id === curso.id ? curso : c));
    return store.guardarCursosData(Object.assign({}, data, { cursos: cursosNuevos }));
  });

  if (!resultadoLock.ok) {
    return res.status(423).render('form', {
      titulo: esNuevo ? 'Nuevo curso' : 'Editar curso', curso, esNuevo,
      sedes: sedesDisponibles(), assets: images.listarAssets(), cfg,
      errores: [resultadoLock.motivo], avisos: [], camposARevisar: [],
      yaPublicado: !esNuevo && fichaManaged(existente && existente.slug),
    });
  }
  const resultado = resultadoLock.valor;

  const operacion = esNuevo ? 'crear' : 'editar';
  historial.registrar({
    usuario: req.session.usuario, operacion, cursoId: curso.id, nombre: curso.nombre, slug: curso.slug,
    estadoAnterior: existente ? existente.estado : null, estadoPosterior: curso.estado,
    camposModificados: existente ? historial.camposModificados(existente, curso) : null,
    resultado: resultado.ok ? 'exito' : 'error', mensajeError: resultado.ok ? null : resultado.errores.join(' '),
  });

  if (!resultado.ok) {
    return res.status(400).render('form', {
      titulo: esNuevo ? 'Nuevo curso' : 'Editar curso', curso, esNuevo,
      sedes: sedesDisponibles(), assets: images.listarAssets(), cfg,
      errores: resultado.errores, avisos: resultado.avisos, camposARevisar: [],
      yaPublicado: !esNuevo && fichaManaged(existente.slug),
    });
  }

  req.session.flash = { tipo: 'exito', mensaje: 'Curso guardado correctamente.', avisos: resultado.avisos };
  res.redirect('/cursos');
});

// ---------------------------------------------------------------------
// Duplicar
// ---------------------------------------------------------------------
router.post('/:id/duplicar', async (req, res) => {
  const data = store.leerCursosData();
  const original = data.cursos.find((c) => c.id === req.params.id);
  if (!original) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Curso no encontrado.' });

  const copia = model.duplicar(original, data.cursos);
  const resultadoLock = await lock.conBloqueo('catalogo', req.session.usuario, async () =>
    store.guardarCursosData(Object.assign({}, data, { cursos: data.cursos.concat([copia]) })));

  if (!resultadoLock.ok) {
    req.session.flash = { tipo: 'error', mensaje: resultadoLock.motivo };
    return res.redirect('/cursos');
  }
  const resultado = resultadoLock.valor;
  historial.registrar({
    usuario: req.session.usuario, operacion: 'duplicar', cursoId: copia.id, nombre: copia.nombre, slug: copia.slug,
    estadoPosterior: copia.estado, resultado: resultado.ok ? 'exito' : 'error',
    mensajeError: resultado.ok ? null : resultado.errores.join(' '),
  });
  if (!resultado.ok) {
    req.session.flash = { tipo: 'error', mensaje: 'No se pudo duplicar: ' + resultado.errores.join(' ') };
    return res.redirect('/cursos');
  }
  req.session.flash = { tipo: 'exito', mensaje: 'Curso duplicado como borrador: ' + copia.nombre };
  res.redirect('/cursos/' + copia.id + '/editar');
});

// ---------------------------------------------------------------------
// Archivar
// ---------------------------------------------------------------------
router.post('/:id/archivar', async (req, res) => {
  const data = store.leerCursosData();
  const curso = data.cursos.find((c) => c.id === req.params.id);
  if (!curso) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Curso no encontrado.' });

  const actualizado = Object.assign({}, curso, { estado: 'archivado', inscripcionAbierta: false });
  const resultadoLock = await lock.conBloqueo('catalogo', req.session.usuario, async () =>
    store.guardarCursosData(Object.assign({}, data, { cursos: data.cursos.map((c) => (c.id === curso.id ? actualizado : c)) })));

  if (!resultadoLock.ok) {
    req.session.flash = { tipo: 'error', mensaje: resultadoLock.motivo };
    return res.redirect('/cursos');
  }
  const resultado = resultadoLock.valor;
  historial.registrar({
    usuario: req.session.usuario, operacion: 'archivar', cursoId: curso.id, nombre: curso.nombre, slug: curso.slug,
    estadoAnterior: curso.estado, estadoPosterior: 'archivado', resultado: resultado.ok ? 'exito' : 'error',
    mensajeError: resultado.ok ? null : resultado.errores.join(' '),
  });
  req.session.flash = resultado.ok
    ? { tipo: 'exito', mensaje: 'Curso archivado.' }
    : { tipo: 'error', mensaje: 'No se pudo archivar: ' + resultado.errores.join(' ') };
  res.redirect('/cursos');
});

// ---------------------------------------------------------------------
// Mover a la papelera — solo borrador y nunca publicado. Nunca borrado
// físico desde la interfaz.
// ---------------------------------------------------------------------
router.post('/:id/papelera', async (req, res) => {
  const data = store.leerCursosData();
  const curso = data.cursos.find((c) => c.id === req.params.id);
  if (!curso) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Curso no encontrado.' });

  if (curso.estado !== 'borrador' || fichaManaged(curso.slug)) {
    req.session.flash = { tipo: 'error', mensaje: 'Solo se puede mover a la papelera un curso en borrador que nunca se haya publicado.' };
    return res.redirect('/cursos');
  }

  const resultadoLock = await lock.conBloqueo('catalogo', req.session.usuario, async () =>
    store.guardarCursosData(Object.assign({}, data, { cursos: data.cursos.filter((c) => c.id !== curso.id) })));

  if (!resultadoLock.ok) {
    req.session.flash = { tipo: 'error', mensaje: resultadoLock.motivo };
    return res.redirect('/cursos');
  }
  const resultado = resultadoLock.valor;
  if (resultado.ok) {
    trash.mover(curso, (req.body.motivo || '').trim() || null, req.session.usuario);
  }
  historial.registrar({
    usuario: req.session.usuario, operacion: 'papelera', cursoId: curso.id, nombre: curso.nombre, slug: curso.slug,
    estadoAnterior: curso.estado, resultado: resultado.ok ? 'exito' : 'error',
    mensajeError: resultado.ok ? null : resultado.errores.join(' '),
  });
  req.session.flash = resultado.ok
    ? { tipo: 'exito', mensaje: 'Curso movido a la papelera.' }
    : { tipo: 'error', mensaje: 'No se pudo mover a la papelera: ' + resultado.errores.join(' ') };
  res.redirect('/cursos');
});

// ---------------------------------------------------------------------
// Vista previa: reconstruye fichas y enlaza a la copia servida por el
// propio panel (nunca la web publicada).
// ---------------------------------------------------------------------
router.post('/:id/vista-previa', (req, res) => {
  const data = store.leerCursosData();
  const curso = data.cursos.find((c) => c.id === req.params.id);
  if (!curso) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Curso no encontrado.' });

  const resultado = runBuildFichas();
  historial.registrar({
    usuario: req.session.usuario, operacion: 'vista-previa', cursoId: curso.id, nombre: curso.nombre, slug: curso.slug,
    resultado: resultado.ok ? 'exito' : 'error',
  });
  req.session.flash = resultado.ok
    ? { tipo: 'exito', mensaje: 'Vista previa generada.' }
    : { tipo: 'error', mensaje: 'Fallo al generar la vista previa. Revisa la consola del panel.' };

  if (resultado.ok && cfg.ESTADOS_PUBLICABLES.includes(curso.estado)) {
    return res.redirect('/preview-site/cursos/' + curso.slug + '/');
  }
  res.redirect('/cursos/' + curso.id + '/editar');
});

module.exports = router;
