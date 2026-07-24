/**
 * catalog-search.js
 *
 * Capa de conveniencia sobre CatalogRepository.search(), pensada para ser el
 * único punto que el buscador de la Home y (más adelante) el asistente
 * llamen para traducir "lo que el usuario ha pedido" en el objeto de
 * filtros que espera el repositorio. Hoy es deliberadamente delgada: no
 * añade ninguna lógica nueva, solo documenta y normaliza la forma de los
 * filtros para que buscador y asistente no reinventen cada uno su propio
 * mapeo (que es exactamente la duplicación detectada en la auditoría).
 *
 * IMPORTANTE (Fase 1): este fichero se crea por limpieza arquitectónica,
 * pero todavía NO está conectado ni al buscador de web/index.html/Home.dc.html
 * ni al asistente. Esa conexión es una fase posterior.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./catalog-repository.js'));
  } else {
    root.CatalogSearch = factory(root.CatalogRepository);
  }
})(typeof self !== 'undefined' ? self : this, function (CatalogRepository) {
  'use strict';

  var VALORES_TODAS = ['todas', 'cualquiera', ''];

  function _esTodas(valor) {
    return valor == null || VALORES_TODAS.indexOf(valor) !== -1;
  }

  /**
   * Normaliza un objeto de filtros "sueltos" (tal como los produce un
   * formulario o el motor del asistente) al formato que espera
   * CatalogRepository.search(). Cualquier valor "todas"/"cualquiera"/vacío
   * se omite (equivale a no filtrar por ese campo).
   */
  function normalizarFiltros(entrada) {
    entrada = entrada || {};
    var filtros = {};
    if (entrada.texto) filtros.texto = entrada.texto;
    if (!_esTodas(entrada.isla)) filtros.isla = entrada.isla;
    if (!_esTodas(entrada.situacion)) filtros.situacion = entrada.situacion;
    if (!_esTodas(entrada.modalidad)) filtros.modalidad = entrada.modalidad;
    if (!_esTodas(entrada.familiaProfesional)) filtros.familiaProfesional = entrada.familiaProfesional;
    if (entrada.tipoPrecio) filtros.tipoPrecio = entrada.tipoPrecio;
    if (entrada.estadosPermitidos) filtros.estadosPermitidos = entrada.estadosPermitidos;
    return filtros;
  }

  /** Punto único de búsqueda: normaliza y delega en el repositorio. */
  function buscar(entrada) {
    return CatalogRepository.search(normalizarFiltros(entrada));
  }

  return {
    normalizarFiltros: normalizarFiltros,
    buscar: buscar,
  };
});
