'use strict';
const express = require('express');
const cfg = require('../config');
const { verificarPassword } = require('../services/auth');
const rateLimit = require('../middleware/rate-limit');
const historial = require('../services/historial');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.usuario) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const ip = req.ip;
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (rateLimit.estaBloqueado(username, ip)) {
    return res.status(429).render('login', {
      error: 'Demasiados intentos fallidos. Vuelve a intentarlo en ' + rateLimit.minutosRestantes(username, ip) + ' minutos.',
    });
  }

  const credencialesOk = username === cfg.ADMIN_USERNAME && verificarPassword(password, cfg.ADMIN_PASSWORD_HASH);
  if (!credencialesOk) {
    rateLimit.registrarFallo(username, ip);
    historial.registrar({ usuario: username || '(vacío)', operacion: 'login-fallido', resultado: 'error' });
    return res.status(401).render('login', { error: 'Usuario o contraseña incorrectos.' });
  }

  rateLimit.registrarExito(username, ip);
  const redirectTo = req.session.postLoginRedirect || '/';
  // Regenerar la sesión al iniciar sesión (evita fijación de sesión).
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('login', { error: 'Error interno al iniciar sesión.' });
    req.session.usuario = username;
    req.session.cookie.maxAge = cfg.ADMIN_SESSION_MAX_AGE_MIN * 60000;
    historial.registrar({ usuario: username, operacion: 'login', resultado: 'exito' });
    req.session.save(() => res.redirect(redirectTo));
  });
});

router.post('/logout', (req, res) => {
  const usuario = req.session && req.session.usuario;
  req.session.destroy(() => {
    if (usuario) historial.registrar({ usuario, operacion: 'logout', resultado: 'exito' });
    res.clearCookie('cem_admin_sid');
    res.redirect('/login');
  });
});

module.exports = router;
