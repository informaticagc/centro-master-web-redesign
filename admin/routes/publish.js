'use strict';
const express = require('express');
const cfg = require('../config');
const lock = require('../services/lock');
const publish = require('../services/publish');
const historial = require('../services/historial');

const router = express.Router();

router.get('/', (req, res) => {
  const plan = publish.prepararPlan();
  res.render('publish-confirm', {
    titulo: 'Publicar en web de pruebas', plan, cfg,
    bloqueado: lock.leerLock('publicacion') && !lock.esHuerfano(lock.leerLock('publicacion')),
  });
});

router.post('/confirmar', async (req, res) => {
  historial.registrar({ usuario: req.session.usuario, operacion: 'intentar-publicar', resultado: 'en-curso' });

  const resultadoLock = await lock.conBloqueo('publicacion', req.session.usuario, async () => {
    // Recalcular el plan justo antes de ejecutar (defensa en profundidad:
    // el estado pudo cambiar entre la pantalla de confirmación y este clic).
    const plan = publish.prepararPlan();
    return publish.ejecutarPublicacion(plan);
  });

  if (!resultadoLock.ok) {
    historial.registrar({ usuario: req.session.usuario, operacion: 'fallo-publicacion', resultado: 'error', mensajeError: resultadoLock.motivo });
    return res.render('publish-result', { titulo: 'Publicación', ok: false, motivo: resultadoLock.motivo, cfg });
  }

  const resultado = resultadoLock.valor;
  if (!resultado.ok) {
    historial.registrar({ usuario: req.session.usuario, operacion: 'fallo-publicacion', resultado: 'error', mensajeError: resultado.motivo });
    return res.render('publish-result', { titulo: 'Publicación', ok: false, motivo: resultado.motivo, commitCreado: resultado.commitCreado, pushFallido: resultado.pushFallido, cfg });
  }

  historial.registrar({
    usuario: req.session.usuario,
    operacion: resultado.simulado ? 'publicar-simulado' : 'publicar-correctamente',
    resultado: 'exito',
  });

  res.render('publish-result', { titulo: 'Publicación', ok: true, resultado, cfg });
});

module.exports = router;
