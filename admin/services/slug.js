'use strict';

/** Convierte un nombre en un slug válido: minúsculas, sin acentos, guiones simples. */
function slugify(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function esSlugValido(slug) {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}

/** Genera un slug único añadiendo -2, -3... si colisiona con los existentes (excluyendo el propio id). */
function slugUnico(base, cursos, idExcluido) {
  const existentes = new Set(cursos.filter((c) => c.id !== idExcluido).map((c) => c.slug));
  let slug = slugify(base) || 'curso';
  let candidato = slug;
  let n = 2;
  while (existentes.has(candidato)) {
    candidato = slug + '-' + n;
    n++;
  }
  return candidato;
}

module.exports = { slugify, esSlugValido, slugUnico, SLUG_PATTERN };
