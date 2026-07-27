'use strict';
const express = require('express');
const store = require('../services/cursos-store');
const trash = require('../services/trash');
const historial = require('../services/historial');
const lock = require('../services/lock');
const slugSvc = require('../services/slug');

const router = express.Router();

router.get('/', (req, res) => {
  res.render('trash', { titulo: 'Papelera', items: trash.listar(), flash: req.session.flash || null });
  req.session.flash = null;
});

router.post('/:id/restaurar', (req, res) => {
  const item = trash.obtener(req.params.id);
  if (!item) return res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'Elemento de papelera no encontrado.' });

  const resultado = lock.adquirir('catalogo', req.session.usuario);
  if (!resultado.ok) {
    req.session.flash = { tipo: 'error', mensaje: resultado.motivo };
    return res.redirect('/papelera');
  }
  try {
    const data = store.leerCursosData();
    const colisiona = data.cursos.some((c) => c.slug === item.curso.slug);
    if (colisiona) {
      item.curso.slug = slugSvc.slugUnico(item.curso.nombre + '-restaurado', data.cursos, null);
    }
    const guardado = store.guardarCursosData(Object.assign({}, data, { cursos: data.cursos.concat([item.curso]) }));
    if (!guardado.ok) {
      req.session.flash = { tipo: 'error', mensaje: 'No se pudo restaurar: ' + guardado.errores.join(' ') };
      historial.registrar({ usuario: req.session.usuario, operacion: 'restaurar', cursoId: item.curso.id, nombre: item.curso.nombre, slug: item.curso.slug, resultado: 'error', mensajeError: guardado.errores.join(' ') });
      return res.redirect('/papelera');
    }
    trash.eliminarDeLaPapelera(req.params.id);
    historial.registrar({ usuario: req.session.usuario, operacion: 'restaurar', cursoId: item.curso.id, nombre: item.curso.nombre, slug: item.curso.slug, estadoPosterior: item.curso.estado, resultado: 'exito' });
    req.session.flash = { tipo: 'exito', mensaje: 'Curso restaurado' + (colisiona ? ' con un slug nuevo por colisión: ' + item.curso.slug : '') + '.' };
  } finally {
    lock.liberar('catalogo');
  }
  res.redirect('/papelera');
});

module.exports = router;
