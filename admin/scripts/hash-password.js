#!/usr/bin/env node
/**
 * Genera un hash de contraseña compatible con ADMIN_PASSWORD_HASH.
 * Uso: node admin/scripts/hash-password.js "mi-contraseña"
 * (o sin argumento: la pide por stdin, para no dejarla en el historial de la shell)
 */
'use strict';
const crypto = require('crypto');
const readline = require('readline');

function hacerHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return 'scrypt:' + salt + ':' + derived;
}

function main(password) {
  if (!password) {
    console.error('Contraseña vacía.');
    process.exit(1);
  }
  console.log('\nADMIN_PASSWORD_HASH=' + hacerHash(password) + '\n');
}

if (process.argv[2]) {
  main(process.argv[2]);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Contraseña a hashear: ', (pw) => { rl.close(); main(pw); });
}
