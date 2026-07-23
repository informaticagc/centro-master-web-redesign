# Centro de Estudios Máster — Rediseño Home

Prototipo de la nueva página principal — **V2.1 aprobada visualmente** (refinamiento de V2: menú
hamburguesa en tablet/móvil, ajustes responsive, nueva integración de marca en el footer, y los
recursos reales restantes integrados: aula/teleformación, logo PIEC, certificación ISO 9001 · SGS).

V2.1 respecto a V2: header con menú hamburguesa accesible (drawer lateral, foco gestionado, cierre
con Escape/clic fuera/botón), footer con una franja de marca diferenciada (en vez de logo en tarjeta
flotante), y sustitución de los 5 placeholders de imagen/logo que quedaban en V2. Verificado visual y
funcionalmente a 1440, 1024, 768 y 390 px; los breakpoints CSS principales del diseño siguen siendo
1180 px y 860 px.

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
/web/assets/             Fotografías y logos reales usados por /web/index.html (y referenciados por
                         /design/Home.dc.html vía ../web/assets/).
```

## Cómo actualizar el repositorio en futuras iteraciones

1. Trabaja las iteraciones de diseño en la rama `design`.
2. Cada versión relevante: actualiza `/design/Home.dc.html` (y `/design/image-slot.js` si cambia) y
   regenera `/web/index.html` a partir del estado aprobado.
3. Haz commit en `design` con un mensaje descriptivo (`design: menú hamburguesa + footer v2.1`, etc.).
4. Cuando una versión quede aprobada para publicar, haz merge de `design` a `main` (o cherry-pick el commit)
   — `main` debe reflejar siempre solo versiones aprobadas y publicables.
5. Con GitHub Pages apuntando a `main` (carpeta `/web` o raíz, según configuración), la URL pública se
   actualiza automáticamente en cada push a `main`.

## Publicar con GitHub Pages

En GitHub: Settings → Pages → Source: rama `main`, carpeta `/web` (o mueve `web/index.html` a la raíz
de una rama `gh-pages` dedicada, si prefieres esa convención). La URL resultante es fija y no requiere
pasos manuales adicionales tras cada push.

## Contenido y datos pendientes

Todos los textos, cifras y datos de contacto proceden de la auditoría de centroformacionmaster.com.
Quedan dos puntos señalados como pendientes de verificación antes de publicar (marcados en el propio
diseño con corchetes):
- La cita y el nombre del testimonio de una persona egresada (sección "Nuestra forma de formar").
- El número total de sedes activas (nota a pie de la sección "Sedes").
