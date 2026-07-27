'use strict';
const express = require('express');
const cfg = require('../config');
const store = require('../services/cursos-store');
const historial = require('../services/historial');
const git = require('../services/git-service');
const { runValidator } = require('../services/validator');

const router = express.Router();

router.get('/', (req, res) => {
  const data = store.leerCursosData();
  const cursos = data.cursos;

  const contadores = { total: cursos.length };
  cfg.ESTADOS.forEach((e) => { contadores[e] = cursos.filter((c) => c.estado === e).length; });
  contadores.destacados = cursos.filter((c) => c.destacado === true).length;

  const proximos = cursos
    .filter((c) => c.fechaInicio || c.fechaInicioAproximada)
    .filter((c) => cfg.ESTADOS_PUBLICABLES.includes(c.estado))
    .slice(0, 8);

  const validacion = runValidator();
  const cursosConAvisos = new Set();
  validacion.avisos.concat(validacion.errores).forEach((linea) => {
    const m = linea.match(/id=([a-z0-9-]+)/i);
    if (m) cursosConAvisos.add(m[1]);
  });

  let gitInfo = null;
  if (git.repoValido()) {
    gitInfo = {
      rama: git.ramaActual(),
      limpio: git.estaLimpio(),
      archivosModificados: git.estadoArchivos().length,
      commitLocal: git.ultimoCommitLocal(),
      commitRemotoConocido: git.ultimoCommitRemotoConocido(),
    };
    gitInfo.hayPendientesDePublicar = !gitInfo.limpio ||
      (gitInfo.commitLocal && gitInfo.commitRemotoConocido && gitInfo.commitLocal.hash !== gitInfo.commitRemotoConocido.hash);
  }

  const recientes = historial.leer({}).slice(0, 8);

  res.render('dashboard', {
    titulo: 'Dashboard',
    contadores, proximos, cursosConAvisos, gitInfo, recientes,
    totalConAvisos: cursosConAvisos.size,
  });
});

module.exports = router;
