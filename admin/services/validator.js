/**
 * validator.js — ejecuta scripts/validate-data.js como subproceso real.
 *
 * No reimplementa ninguna regla de validación: se limita a invocar el
 * validador oficial (mismo que usa CI) y a parsear su salida de texto en
 * errores/avisos/recomendaciones estructurados. `execFile` con argumentos
 * fijos (nunca una cadena de shell construida con datos del usuario) evita
 * cualquier inyección de comandos.
 */
'use strict';
const { execFileSync } = require('child_process');
const cfg = require('../config');

const PROPIEDADES_RECOMENDACION = ['codigo', 'ref', 'campo', 'categoria', 'mensaje'];

// Solo exige que las 5 propiedades obligatorias existan como string.
// Propiedades adicionales en el objeto no invalidan la recomendación: el
// contrato de esta fase es "como mínimo estas 5 claves", no "exactamente
// estas 5" — no hay ninguna razón para descartar una recomendación futura
// que añada, p.ej., un campo "severidad" opcional.
function esRecomendacionValida(obj) {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj)
    && PROPIEDADES_RECOMENDACION.every((p) => typeof obj[p] === 'string');
}

/**
 * Interpreta el stdout de scripts/validate-data.js. Función pura (solo
 * recibe el string, no ejecuta nada ni toca el sistema de archivos) para
 * poder probarse directamente, sin pasar por un subproceso real.
 *
 * Formato de cada línea reconocida:
 *   ✗ <mensaje>                                  -> errores
 *   ! <mensaje>                                  -> avisos
 *   ? {"codigo":...,"ref":...,...}  (JSON)        -> recomendaciones
 * Cualquier otra línea (cabeceras, "RESULTADO: OK", el bloque informativo
 * de "Campos nunca utilizados", líneas en blanco...) se ignora.
 *
 * Una línea "?" con JSON inválido o incompleto es un fallo del propio
 * productor del informe (scripts/validate-data.js), no un error en los
 * datos de un curso: nunca lanza una excepción, nunca se añade a
 * "errores" ni afecta a "ok", y se descarta sin más — el texto completo
 * de la línea sigue disponible en el "raw" que ya conserva runValidator().
 */
function parsearSalidaValidador(stdout) {
  const errores = [];
  const avisos = [];
  const recomendaciones = [];

  stdout.split('\n').forEach((linea) => {
    const t = linea.trim();
    if (t.startsWith('✗')) {
      errores.push(t.replace(/^✗\s*/, ''));
    } else if (t.startsWith('!')) {
      avisos.push(t.replace(/^!\s*/, ''));
    } else if (t.startsWith('?')) {
      const jsonTexto = t.replace(/^\?\s*/, '');
      try {
        const obj = JSON.parse(jsonTexto);
        if (esRecomendacionValida(obj)) recomendaciones.push(obj);
      } catch (e) {
        // Descartada deliberadamente — ver comentario de la función.
      }
    }
  });

  return { errores, avisos, recomendaciones };
}

function runValidator(dataDirOverride) {
  const env = Object.assign({}, process.env);
  if (dataDirOverride) env.VALIDATE_DATA_DIR = dataDirOverride;

  let stdout = '';
  let ok = true;
  try {
    stdout = execFileSync(process.execPath, [cfg.VALIDATE_SCRIPT], { env: env, encoding: 'utf8' });
  } catch (e) {
    ok = false;
    stdout = (e.stdout || '').toString();
  }

  const { errores, avisos, recomendaciones } = parsearSalidaValidador(stdout);

  return { ok: ok && errores.length === 0, errores, avisos, recomendaciones, raw: stdout };
}

module.exports = {
  runValidator,
  __test: { parsearSalidaValidador, esRecomendacionValida },
};
