# Centro de Estudios Máster — Rediseño Home

Prototipo de la nueva página principal — **V2.2 aprobada visualmente**.

V2.2 respecto a V2.1: navegación en dos niveles (barra corporativa superior + header principal),
menú hamburguesa actualizado con accesos agrupados, nueva sección "Alquiler de instalaciones", footer
simplificado a un único bloque oscuro uniforme (sin logo ni franja de marca — identidad solo por
texto), los recursos reales restantes integrados (Inserción laboral, Ofimática, Alquiler de
instalaciones), un testimonio provisional claramente marcado, y un centro de contacto flotante
unificado (¿Necesitas ayuda?) con tres vías: asistente informativo con flujo guiado "Buscar un
curso" (situación laboral → isla → modalidad → resultados del catálogo real), WhatsApp (enlace real
a wa.me/34682821956) y un formulario "Solicitar que me contacten" con validación y confirmación
simuladas. Todo el centro de contacto es un prototipo visual: no hay IA, CRM ni envío real conectado
todavía.

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
- El testimonio de la sección "Nuestra forma de formar" es **provisional** (marcado con badge
  "PROVISIONAL" y firma "Testimonio provisional — sustituir antes de publicar") — sustituir por una
  cita real de una persona egresada antes de publicar.
- El número total de sedes activas (nota a pie de la sección "Sedes").
