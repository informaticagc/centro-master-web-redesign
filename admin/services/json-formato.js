/**
 * json-formato.js — serializa JSON reproduciendo el estilo de
 * web/data/cursos.json: indentación de 2 espacios, misma clave-orden que
 * JSON.stringify, pero los arrays de valores primitivos (strings, números,
 * booleanos, null) se escriben en una sola línea, igual que están en el
 * fichero a mano. Evita que guardar un solo curso reformatee los arrays de
 * los demás — JSON.stringify(x, null, 2) no distingue eso y expande todos
 * los arrays no vacíos a multilínea.
 */
'use strict';

function esPrimitivo(v) {
  return v === null || (typeof v !== 'object' && typeof v !== 'undefined');
}

function serializarValor(valor, indent, prefijo) {
  if (valor === undefined) return 'null';

  if (Array.isArray(valor)) {
    if (valor.length === 0) return '[]';
    if (valor.every(esPrimitivo)) {
      return '[' + valor.map((v) => JSON.stringify(v)).join(', ') + ']';
    }
    const interiorPrefijo = prefijo + indent;
    const interior = valor
      .map((v) => interiorPrefijo + serializarValor(v, indent, interiorPrefijo))
      .join(',\n');
    return '[\n' + interior + '\n' + prefijo + ']';
  }

  if (valor !== null && typeof valor === 'object') {
    const claves = Object.keys(valor).filter((k) => valor[k] !== undefined);
    if (claves.length === 0) return '{}';
    const interiorPrefijo = prefijo + indent;
    const interior = claves
      .map((k) => interiorPrefijo + JSON.stringify(k) + ': ' + serializarValor(valor[k], indent, interiorPrefijo))
      .join(',\n');
    return '{\n' + interior + '\n' + prefijo + '}';
  }

  return JSON.stringify(valor);
}

/** Serializa `datos` con el estilo de cursos.json. Determinista e idempotente. */
function serializar(datos) {
  return serializarValor(datos, '  ', '');
}

module.exports = { serializar };
