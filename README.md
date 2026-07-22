# Centro de Estudios Máster — Rediseño Home

Prototipo de la nueva página principal — **V2 aprobada** (refinamiento visual y de experiencia sobre la V1 baseline). Sin cambios adicionales respecto a la iteración validada.

V2 respecto a V1: hero fotográfico a sangre, buscador como tarjeta flotante, cursos destacados en composición editorial (1 destacado + 3 secundarios), sección "Encuentra tu formación" con tiles fotográficos, sección de confianza narrativa con foto de fondo, "Nuestra forma de formar" en filas alternadas con testimonio pendiente, sedes con foto dominante, colaboradores categorizados. Todas las fotos/logos siguen siendo placeholders claramente marcados (`[FOTO: …]`, `[LOGO: …]`) y los datos no verificados están señalados (`[DATO PENDIENTE]`).

## Estructura

```
/design/Home.dc.html    Fuente editable del prototipo (formato "Design Component" de Claude Design).
                         Requiere el runtime interno de Claude Design (support.js) — solo se abre/edita
                         dentro de ese entorno, no en un navegador cualquiera.
/design/image-slot.js    Componente de placeholders de imagen (drag-and-drop) usado por Home.dc.html.
                         Necesario únicamente para seguir editando en Claude Design.
/web/index.html          Versión standalone: HTML + CSS + JS vanilla, sin dependencias externas
                         (aparte de la fuente de Google Fonts). Se abre directamente en cualquier
                         navegador y es lo que debe publicarse en GitHub Pages.
```

`/web/index.html` sustituye los `<image-slot>` interactivos por bloques de marcador de posición estáticos
(recuadro punteado + etiqueta) porque ese componente depende del runtime de Claude Design para el
guardado de imágenes. Sirve para visualizar y compartir el diseño; para seguir iterando visualmente,
edita `/design/Home.dc.html` dentro de Claude Design.

## Cómo actualizar el repositorio en futuras iteraciones

1. Trabaja las iteraciones de diseño en la rama `design`.
2. Cada versión relevante: actualiza `/design/Home.dc.html` (y `/design/image-slot.js` si cambia) y
   regenera `/web/index.html` a partir del estado aprobado.
3. Haz commit en `design` con un mensaje descriptivo (`design: hero editorial v2`, `design: rediseño colaboradores`, etc.).
4. Cuando una versión quede aprobada para publicar, haz merge de `design` a `main` (o cherry-pick el commit)
   — `main` debe reflejar siempre solo versiones aprobadas y publicables.
5. Con GitHub Pages apuntando a `main` (carpeta `/web` o raíz, según configuración), la URL pública se
   actualiza automáticamente en cada push a `main`.

## Publicar con GitHub Pages

En GitHub: Settings → Pages → Source: rama `main`, carpeta `/web` (o mueve `web/index.html` a la raíz
de una rama `gh-pages` dedicada, si prefieres esa convención). La URL resultante es fija y no requiere
pasos manuales adicionales tras cada push.

## Contenido y datos

Todos los textos, cifras y datos de contacto proceden de la auditoría de centroformacionmaster.com
(páginas de formación, sedes y colaboradores). Dos puntos quedan señalados como pendientes de
verificación antes de publicar:
- El número total de sedes activas (se muestran 3; la web original mencionaba "4 sedes").
- Cualquier cifra de inserción laboral (no incluida en esta versión hasta poder verificarse).
