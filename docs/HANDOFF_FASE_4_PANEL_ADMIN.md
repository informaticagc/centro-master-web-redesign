# Traspaso — Fase 4 (Panel administrativo de cursos)

Documento autosuficiente para continuar el proyecto en una conversación
nueva de Claude Code, sin depender del historial de la conversación en la
que se implementó. Léelo entero antes de tocar nada.

## A. Proyecto y repositorio

- **Proyecto**: rediseño web de Centro de Estudios Máster (Canarias).
- **Repositorio**: `informaticagc/centro-master-web-redesign` (GitHub, público).
- **Rama activa de trabajo**: `design`.
- **Rama de producción**: `main` — **nunca tocarla, nunca hacerle push,
  nunca mergear nada en ella sin instrucción explícita del usuario**.
- **Estructura principal**:
  ```
  web/              sitio público (servido por GitHub Pages)
    data/           fuente única de datos (cursos.json, sedes.json, ...)
    js/              CatalogRepository, CatalogSearch, help-widget
    css/             help-widget.css
    cursos/          catálogo + fichas generadas (build-fichas.js)
    assets/          imágenes públicas
    index.html       Home
  design/            fuentes editables .dc.html (Claude Design) — Home,
                     Catálogo de cursos, Curso
  scripts/           validate-data.js, build-fichas.js, dev-server.js
  admin/             panel administrativo interno (Fases 4A/4B) — NUNCA
                     se publica, no forma parte de web/
  data-internal/     datos internos (gitignorado, no tocar en esta fase)
  ```
- **URL de GitHub Pages de pruebas**:
  `https://informaticagc.github.io/centro-master-web-redesign/design-preview/`
  (se actualiza automáticamente en cada push a `design`, vía
  `.github/workflows/pages.yml`; también publica `main` en la raíz).
- **Último commit antes de la Fase 4**: `a1d8c93` — "feat: añadir catálogo
  y fichas dinámicas de cursos" (cierre de la Fase 3B).
- Los commits de las Fases 4A/4B se añaden a continuación de ese, en
  `design`, sin tocar `main` en ningún momento.

## B. Arquitectura pública existente (Fases 1–3, ya cerradas)

- **`web/data/cursos.json`**: única fuente de verdad de los cursos. Modelo
  completo documentado dentro del propio fichero y en
  `scripts/validate-data.js`. Contiene también `sedes.json`,
  `conocimiento.json`, `faq.json`, `sinonimos.json` en la misma carpeta.
- **`web/js/catalog-repository.js`**: única puerta de lectura de esos JSON.
  Expone `getAll()`, `getPublicCourses()`, `getById()`, `getBySlug()`,
  `search()`, `getFeatured()`, `getSedes()`, etc. Funciona tanto en
  navegador (fetch) como en Node/CommonJS (usado por `build-fichas.js`).
- **`web/js/catalog-search.js`**: capa de normalización de filtros sobre
  `CatalogRepository.search()`. La usan Home, el catálogo y (cuando se
  conecte) el asistente — mismo motor, mismos resultados.
- **Home dinámica** (`web/index.html` / `design/Home.dc.html`): destacados,
  buscador, sedes y asistente conectados al catálogo real. Enlaza a fichas
  reales por slug (`cursos/{slug}/`).
- **Catálogo** (`web/cursos/index.html`): filtros derivados de datos reales
  (nunca listas fijas inventadas); el filtro "Familia profesional" solo
  aparece si algún curso tiene ese dato.
- **Fichas generadas** (`web/cursos/{slug}/index.html`): una por curso
  publicable. Nunca se editan a mano — las regenera
  `scripts/build-fichas.js`.
- **`scripts/build-fichas.js`**: genera `web/cursos/{slug}/index.html` para
  cursos en estado publicable. Idempotente (ejecutarlo dos veces produce el
  mismo árbol byte a byte). Fichas huérfanas (curso que pasó a
  `borrador`/`archivado`) se sustituyen por una página de redirección al
  catálogo — nunca se borran ni quedan como 404.
- **`scripts/validate-data.js`**: validador real y único de los datos.
  Admite `VALIDATE_DATA_DIR` (variable de entorno opcional) para validar
  una copia "staged" sin tocar el fichero real — lo usa `admin/` antes de
  escribir. Sin esa variable, comportamiento idéntico al de siempre (no
  afecta a CI).
- **Estados de curso**: `borrador`, `proximamente`, `matricula-abierta`,
  `ultimas-plazas`, `en-curso`, `finalizado`, `archivado`.
  - **Públicos** (aparecen en el catálogo/buscador): `proximamente`,
    `matricula-abierta`, `ultimas-plazas`, `en-curso`.
  - **Publicables** (generan ficha, pero `finalizado` no aparece en el
    catálogo): los 4 anteriores + `finalizado`.
  - **No publicables** (nunca generan ficha nueva): `borrador`, `archivado`.
- **Cursos finalizados**: mantienen su ficha (con aviso "ya ha finalizado",
  sin CTA de inscripción activa, con CTA "Consultar próxima convocatoria" y
  bloque de cursos similares/otros cursos disponibles), pero no aparecen en
  el catálogo público.
- **Cursos archivados**: no aparecen en catálogo; si tenían una ficha
  generada previamente, se sustituye por una redirección al catálogo
  (nunca 404, nunca contenido obsoleto).

## C. Fase 4A — Prototipo local del panel

- **Arquitectura**: Node/Express (elegido sobre Flask precisamente porque
  `catalog-repository.js`, `validate-data.js` y `build-fichas.js` ya son
  Node — cero duplicación de reglas entre lenguajes).
- **Lectura/escritura segura** (`admin/services/cursos-store.js`):
  1. valida forma mínima en memoria;
  2. copia "staged" de `web/data/` a un directorio temporal;
  3. ejecuta `validate-data.js` real contra esa copia (nunca el archivo
     real hasta que pasa);
  4. si es válido: backup del `cursos.json` real en
     `admin/data/backups/`, escritura en `.tmp`, `JSON.parse` de
     comprobación, `rename` atómico sobre el real;
  5. relectura final con restauración automática del backup si algo falla.
- **Formulario** (`admin/views/form.ejs`): 11 bloques (datos básicos,
  estado/publicación, ubicación/modalidad, fechas/horario,
  destinatarios/requisitos, precio/ayudas, certificación/nivel,
  contenido/módulos, imagen, inscripción/contacto, SEO). Listas repetibles
  genéricas vía `partials/repeatable.ejs` + `public/app.js`. Slug
  autogenerado desde el nombre hasta que se edita a mano.
- **Imágenes** (`admin/services/images.js`): selección de
  `web/assets/` existentes o subida controlada (extensión whitelist —
  nunca SVG —, tamaño máx. 5 MB, MIME verificado, nombre siempre
  regenerado con slug + sufijo si colisiona, nunca sobrescribe).
- **Duplicar** (`admin/services/curso-model.js: duplicar()`): id y slug
  nuevos, `estado→borrador`, `inscripcionAbierta→false`, limpia fechas,
  plazas, `destacado`, `orden`, `urlFicha`, `urlInscripcion`; conserva el
  resto (contenido, clasificación, imagen, precio/ayudas).
- **Vista previa local**: botón que ejecuta `build-fichas.js` real y sirve
  el resultado bajo `/preview-site/` (la propia carpeta `web/`, servida por
  el panel) con un banner "VISTA PREVIA LOCAL" inyectado. Nunca commit, nunca push.
- **Dependencias**: `express`, `express-session`, `ejs` (^6, sin
  vulnerabilidades), `multer` (^2, sin vulnerabilidades).

## D. Fase 4B — Panel operativo y publicación segura en pruebas

- **Autenticación** (`admin/services/auth.js`, `middleware/require-auth.js`):
  usuario + hash `scrypt` por variables de entorno
  (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`), comparación
  en tiempo constante. Sin `.env` completo, el servidor no arranca y
  explica qué falta. Sesión: cookie `httpOnly`, `SameSite=Lax`, `secure`
  configurable (`ADMIN_COOKIE_SECURE`), expiración configurable
  (`ADMIN_SESSION_MAX_AGE_MIN`), regenerada en login, destruida en logout.
  Escucha solo en `127.0.0.1` salvo que se fije `ADMIN_HOST` explícitamente.
- **CSRF** (`middleware/csrf.js`): token por sesión, exigido en todo POST
  con formulario (incluye login/logout). Las subidas multipart (imágenes)
  lo verifican aparte por cabecera `X-CSRF-Token` (el *body parser*
  estándar no rellena `req.body` en peticiones multipart).
- **Limitación de intentos** (`middleware/rate-limit.js`): bloqueo temporal
  por usuario+IP tras N fallos (`ADMIN_LOGIN_MAX_ATTEMPTS`,
  `ADMIN_LOGIN_LOCKOUT_MIN`), en memoria (proceso único).
- **Dashboard** (`admin/routes/dashboard.js`): contadores reales por
  estado, destacados, próximos por fecha, avisos de validación,
  operaciones recientes, estado Git legible (rama, limpio/sucio,
  pendiente de publicar, con detalles técnicos en un `<details>` aparte).
- **Papelera lógica** (`admin/services/trash.js`, `routes/trash.js`): solo
  borradores nunca publicados; guardado íntegro en `admin/data/trash/`
  (fuera de Git); restaurar detecta colisión de slug y renombra
  automáticamente; nunca borrado físico desde la interfaz.
- **Historial** (`admin/services/historial.js`): JSON Lines en
  `admin/data/historial/operaciones.jsonl` (fuera de Git), nunca contiene
  secretos/cookies; vista con filtros básicos.
- **Nueva convocatoria** (`curso-model.js: nuevaConvocatoria()`): NO guarda
  nada automáticamente — solo propone el formulario pre-rellenado con
  campos resaltados (`nombre, slug, fechaInicio, horario, sedeId,
  plazasDisponibles, precio, ayudasBecas, urlInscripcion, estado`) para que
  Secretaría confirme antes de guardar.
- **Validación editorial** (`admin/services/editorial.js`): capa adicional
  de avisos de calidad de contenido, separada del validador técnico real;
  nunca bloquea, enlaza a los campos del formulario.
- **Modo simulación** (`ADMIN_PUBLISH_DRY_RUN`, por defecto `true`):
  ejecuta todo el flujo de publicación real (validación, build, git fetch,
  cálculo de staging) salvo `git commit`/`git push`. Banner "MODO
  SIMULACIÓN" visible en todo momento mientras está activo.
- **Flujo de publicación** (`admin/services/publish.js`,
  `routes/publish.js`): auth → bloqueo → rama `design` obligatoria (nunca
  `main`/`master`) → remote `origin` verificado → `git fetch origin
  design` → bloqueo si el remoto va por delante → validar → generar
  fichas → validar de nuevo → calcular archivos permitidos → mostrar
  plan → `git add` (lista explícita) → `git commit` → `git push origin
  design` → liberar bloqueo.
- **Controles Git** (`admin/services/git-service.js`): todo con
  `execFileSync('git', [...])`, argumentos fijos, nunca shell ni
  concatenación. Nada de rama/remote/rutas configurable desde el
  navegador — todo fijo en `admin/config.js`.
- **Bloqueos** (`admin/services/lock.js`): ficheros marcador en
  `admin/data/tmp/locks/`, con recuperación automática de bloqueos
  huérfanos (más de 5 minutos).
- **Recuperación ante fallos**: JSON corrupto → error controlado, servidor
  no cae. Fallo de push tras crear el commit → el commit local **no se
  deshace**, se informa con claridad, se bloquean nuevas publicaciones
  hasta revisión manual.

## E. Reglas críticas (no romper nunca)

1. `web/data/cursos.json` es la **única** fuente de datos de cursos.
   Nunca crear una base de datos ni un JSON paralelo.
2. Nunca usar `git add .` ni `git add -A` — ni desde el panel ni desde una
   conversación de Claude Code. Siempre lista explícita de archivos.
3. El panel solo publica a `origin/design`. Nunca a `main`.
4. Nunca hacer merge, reset, rebase, force push ni tocar `main`
   automáticamente — ni el panel ni una conversación de Claude Code sin
   instrucción explícita del usuario.
5. Nunca publicar (ni desde el panel ni por commit manual)
   `admin/data/` (backups, trash, historial, tmp), `admin/.env`,
   `admin/node_modules/`.
6. Nunca guardar secretos, contraseñas ni hashes reales en Git.
7. El panel (`admin/`) nunca se expone por GitHub Pages ni se referencia
   desde `web/`.
8. `ADMIN_PUBLISH_DRY_RUN` debe seguir en `true` hasta que el usuario
   decida explícitamente lo contrario (ver sección I).

## F. Lista permitida de publicación (allowlist)

Definida en `admin/services/publish.js: esArchivoPermitido()`:

- `web/data/cursos.json` (ruta exacta)
- `web/assets/*` (cualquier archivo dentro)
- `web/cursos/**` (cualquier archivo dentro, fichas generadas)

Cualquier otro archivo modificado detectado por `git status --porcelain`
**bloquea toda la publicación** desde el panel y se muestra explícitamente
en la pantalla de confirmación — nunca se publica parcialmente ni se
ignora en silencio.

## G. Instalación y arranque (Windows)

```bash
cd admin
npm install
node scripts/hash-password.js "contraseña-elegida"
```

Copia `admin/.env.example` a `admin/.env` (nunca se sube a Git) y rellena
`ADMIN_USERNAME`, el `ADMIN_PASSWORD_HASH` obtenido arriba, y un
`SESSION_SECRET` aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Arrancar:

```bash
npm start
```

Panel en `http://127.0.0.1:4000` (o el `ADMIN_PORT` configurado).

## H. Estado actual de pruebas (al cierre de la Fase 4B)

- `node scripts/build-fichas.js` → **OK** (4 cursos publicables, 4 fichas,
  0 huérfanas).
- `node scripts/validate-data.js` → **0 errores, 6 avisos** (los mismos de
  siempre: 4 cursos sin descripción + 2 de `conocimiento.json`).
- `npm audit` (en `admin/`) → **0 vulnerabilidades**.
- Datos de prueba restaurados: `web/data/cursos.json` idéntico al commit
  anterior; `admin/data/{trash,historial,backups,tmp}/` vacíos (solo
  `.gitkeep`).
- **Publicación real todavía NO probada.** Solo se ha probado en modo
  simulación (`ADMIN_PUBLISH_DRY_RUN=true`).
- "Rama incorrecta" y "remoto divergente" se verificaron **por revisión de
  código** (lógica en `git-service.js`/`publish.js`), no ejecutando un
  cambio de rama real ni provocando una divergencia real contra
  `origin/design` — deliberadamente, para no arriesgar el estado real del
  repositorio.

## I. Próxima tarea exacta — Fase 4C

**Prueba controlada de publicación real en `design`.** Procedimiento
previsto, en este orden, sin saltarse pasos:

1. Arrancar el panel con `ADMIN_PUBLISH_DRY_RUN=true` (tal como queda).
2. Comprobar autenticación y dashboard.
3. Hacer una modificación **inocua y claramente reversible** en un curso
   real (p. ej. un cambio de texto trivial, documentado para poder
   deshacerlo exactamente).
4. Guardar.
5. Previsualizar localmente.
6. Ejecutar el plan de publicación **en modo simulación** y revisar
   exactamente los archivos y el mensaje de commit previstos.
7. **Solo tras confirmación explícita del usuario** en esa conversación,
   cambiar temporalmente `ADMIN_PUBLISH_DRY_RUN=false` en `admin/.env`.
8. Publicar en `design` (un único intento, observando el resultado).
9. Comprobar GitHub Pages (`/design-preview/`), con margen de unos minutos.
10. Decidir junto al usuario si conservar o revertir el cambio de prueba.
11. Volver a poner `ADMIN_PUBLISH_DRY_RUN=true` en `admin/.env` al terminar.

**La nueva conversación no debe ejecutar una publicación real sin
confirmación expresa del usuario en esa misma conversación** — la
confirmación de esta conversación no es válida para la siguiente.

## J. Riesgos pendientes

- Un solo usuario administrativo, sin roles ni multiusuario real.
- Sin verificación del resultado del despliegue vía API de GitHub Actions
  (el panel solo avisa de que puede tardar unos minutos).
- Publicación real todavía no probada de extremo a extremo.
- Papelera e historial son locales al equipo donde corre el panel, no se
  comparten entre puestos de trabajo.
- Bloqueo de concurrencia actual es de un solo proceso — si en el futuro
  el panel corre en red local con varios equipos accediendo, haría falta
  revisar el mecanismo de bloqueo.
- Despliegue seguro en red local (HTTPS, `ADMIN_HOST` distinto de
  localhost) queda pendiente de diseño si se decide exponerlo más allá de
  un único equipo.
- Producción (`main` / dominio final) sigue sin estar disponible ni
  conectada a este panel.

## K. Archivos principales del panel

| Archivo | Función |
|---|---|
| `admin/server.js` | Entry point Express: sesión, CSRF, auth, montaje de rutas, banner de vista previa. |
| `admin/config.js` | Toda la configuración fija (rutas, estados válidos, Git, publicación, variables de entorno). |
| `admin/services/cursos-store.js` | Lectura/escritura segura de `cursos.json` (staging + backup + atómico). |
| `admin/services/curso-model.js` | Formulario ↔ modelo; `duplicar()`, `nuevaConvocatoria()`. |
| `admin/services/validator.js` | Ejecuta `scripts/validate-data.js` real como subproceso. |
| `admin/services/builder.js` | Ejecuta `scripts/build-fichas.js` real como subproceso. |
| `admin/services/editorial.js` | Avisos editoriales adicionales (no técnicos) antes de publicar. |
| `admin/services/git-service.js` | Todas las llamadas Git (execFile, argumentos fijos). |
| `admin/services/publish.js` | Orquesta el flujo completo de publicación (o su simulación). |
| `admin/services/lock.js` | Bloqueos de catálogo/publicación con recuperación de huérfanos. |
| `admin/services/historial.js` | Registro JSON Lines de operaciones administrativas. |
| `admin/services/trash.js` | Papelera lógica de borradores. |
| `admin/services/images.js` | Listado y subida controlada de imágenes. |
| `admin/services/auth.js` | Verificación de contraseña (scrypt). |
| `admin/services/slug.js` | Slugify, validación y unicidad de slugs. |
| `admin/middleware/require-auth.js` | Exige sesión iniciada salvo `/login`/`/logout`. |
| `admin/middleware/csrf.js` | Protección CSRF por sesión. |
| `admin/middleware/rate-limit.js` | Bloqueo de fuerza bruta en login. |
| `admin/routes/*.js` | Rutas Express (cursos, imágenes, papelera, historial, publicación, auth, dashboard). |
| `admin/views/*.ejs` | Plantillas server-side (EJS). |
| `admin/scripts/hash-password.js` | Genera `ADMIN_PASSWORD_HASH`. |
| `admin/test/smoke.js` | `npm test` — pruebas de humo de solo lectura. |
| `admin/test/extra-scenarios.js` | Pruebas manuales de escenarios de riesgo (bloqueos, fallo de push simulado) — no forma parte de `npm test`. |
| `admin/README.md` | Documentación operativa del panel (instalación, arranque, limitaciones). |
| `admin/.env.example` | Plantilla de variables de entorno, sin secretos reales. |

## L. Comandos de diagnóstico

```bash
git branch --show-current
git status
git log -1 --oneline
git fetch origin design
git rev-list --left-right --count design...origin/design
node scripts/validate-data.js
node scripts/build-fichas.js
cd admin
npm test
npm audit
```

No incluir nunca en commits ni en salidas compartidas el contenido de
`admin/.env`, ningún `ADMIN_PASSWORD_HASH` real, ni ningún `SESSION_SECRET`
real.
