/**
 * auth.js — verificación de contraseña con scrypt + comparación en tiempo
 * constante. Formato de hash: "scrypt:<saltHex>:<derivedHex>".
 */
'use strict';
const crypto = require('crypto');

function verificarPassword(password, hashAlmacenado) {
  if (!hashAlmacenado || !password) return false;
  const partes = hashAlmacenado.split(':');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  const [, saltHex, derivedHex] = partes;
  let derivedEsperado;
  try {
    derivedEsperado = Buffer.from(derivedHex, 'hex');
  } catch (e) {
    return false;
  }
  const derivedCalculado = crypto.scryptSync(password, saltHex, derivedEsperado.length || 64);
  if (derivedCalculado.length !== derivedEsperado.length) return false;
  return crypto.timingSafeEqual(derivedCalculado, derivedEsperado);
}

module.exports = { verificarPassword };
