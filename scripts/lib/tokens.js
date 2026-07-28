#!/usr/bin/env node
/**
 * scripts/lib/tokens.js
 *
 * Tokens visuales compartidos (variables de color/tipografía y reset base)
 * usados por cualquier página generada con el mismo sistema visual que las
 * fichas de curso. Extraído sin cambios de scripts/build-fichas.js — mismos
 * valores, mismo formato de texto, byte a byte.
 *
 * Módulo puro: solo exporta constantes de texto. No lee ni escribe en disco,
 * no depende de estado global.
 */
'use strict';

const ROOT_TOKENS_CSS =
'  :root{ --bg: oklch(98% 0.012 85); --ink: oklch(20% 0.02 260); --ink-soft: oklch(45% 0.02 260); --ink-strong: oklch(16% 0.02 260); --primary: oklch(30% 0.09 255); --accent: oklch(66% 0.17 45); --line: oklch(91% 0.01 85); --surface: oklch(99.5% 0.004 85); --tint: oklch(96% 0.012 85); --dark: oklch(15% 0.02 260); }\n';

const BASE_RESET_CSS =
'  *{box-sizing:border-box;}\n' +
'  body{margin:0;background:var(--bg);color:var(--ink);font-family:\'Work Sans\',sans-serif;}\n' +
'  a{color:var(--primary);text-decoration:none;}\n' +
'  a:hover{color:oklch(56% 0.15 45);}\n' +
'  h1,h2,h3{font-family:\'Sora\',sans-serif;}\n' +
'  .wrap{width:100%;max-width:1920px;margin:0 auto;overflow-x:hidden;}\n' +
'  @media (prefers-reduced-motion: reduce){ *{animation-duration:0.001ms !important; transition-duration:0.001ms !important; transition:none !important;} }\n';

module.exports = { ROOT_TOKENS_CSS: ROOT_TOKENS_CSS, BASE_RESET_CSS: BASE_RESET_CSS };
