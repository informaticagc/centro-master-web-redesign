# Panel interno de gestión de cursos (Fase 4A + 4B)

Aplicación Node/Express **local**, pensada para que Secretaría gestione
`web/data/cursos.json` sin tocar terminal, Git ni JSON a mano. No se publica:
no forma parte de `web/`, no la sirve GitHub Pages, no la toca ningún workflow.

## Requisitos

- Node.js 18 o superior (probado con Node 22).
- Windows, con Git ya configurado en el equipo (el panel invoca `git` para
  publicar, nunca lo instala ni lo configura).

## Instalación

```bash
cd admin
npm install
```

## Configuración (`.env`)

Copia `admin/.env.example` a `admin/.env` (este archivo **nunca** se sube a
Git — está en `.gitignore`) y rellena:

```bash
node admin/scripts/hash-password.js "tu-contraseña"
```

Copia la línea `ADMIN_PASSWORD_HASH=...` que imprime al `.env`. Genera
también un `SESSION_SECRET` aleatorio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Variables disponibles: ver comentarios en `admin/.env.example`. Sin
`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` o `SESSION_SECRET` el servidor se
niega a arrancar y explica qué falta.

## Arrancar en Windows

```bash
cd admin
npm start
```

Abre `http://127.0.0.1:4000` (o el `ADMIN_PORT` configurado). Por defecto
solo escucha en `127.0.0.1` — exponerlo en la red local exige fijar
`ADMIN_HOST` explícitamente en `.env`, con conocimiento de que no hay HTTPS
propio delante.

## Pruebas

```bash
npm test
```

Pruebas de humo de solo lectura (no modifican `cursos.json`): slugs,
verificación de contraseña, transformaciones del modelo de curso, filtro de
archivos permitidos para publicar, y una pasada real de
`scripts/validate-data.js` sobre los datos actuales.

## Modo simulación de publicación

Con `ADMIN_PUBLISH_DRY_RUN=true` (valor por defecto), el botón "Publicar en
web de pruebas" ejecuta **todo** el flujo real (validación, generación de
fichas, comprobaciones Git, cálculo de archivos, mensaje de commit) pero
**nunca ejecuta `git commit` ni `git push`**. La interfaz muestra en todo
momento el aviso "MODO SIMULACIÓN: no se publicará ningún cambio". Usa
siempre este modo hasta haber revisado el flujo completo; cambiar a
`ADMIN_PUBLISH_DRY_RUN=false` debe decidirlo el responsable del proyecto de
forma explícita, no un valor por defecto.

## Vista previa

"Previsualizar" ejecuta `scripts/build-fichas.js` real sobre los datos ya
guardados y sirve el resultado en `http://localhost:<puerto>/preview-site/`
— la misma carpeta `web/` servida por el propio panel, con un banner azul
"VISTA PREVIA LOCAL" inyectado para que nunca se confunda con la web
publicada. No hace commit ni push.

## Publicación real (cuando se decida activarla)

Flujo exacto: autenticación → bloqueo de publicación → comprobar rama
`design` (nunca `main`) → comprobar remote `origin` → `git fetch origin
design` → bloquear si el remoto tiene commits que no están en local →
validar → generar fichas → validar de nuevo → calcular la lista explícita
de archivos permitidos (`web/data/cursos.json`, `web/assets/*` nuevos,
`web/cursos/**`) → si hay algún archivo modificado fuera de esa lista,
bloquear y mostrarlo → mostrar plan y mensaje de commit → `git add` de la
lista exacta (nunca `.` ni `-A`) → `git commit` → `git push origin design`
→ liberar bloqueo.

### Si falla el push tras crear el commit

El panel **no deshace el commit local automáticamente**. Se muestra un
aviso explícito de que hay un commit pendiente de subir y se bloquean
nuevas publicaciones hasta que alguien lo revise manualmente (comprobar
conexión, reintentar `git push origin design` a mano, o pedir ayuda
técnica). Nunca se ejecuta `reset`, `push --force` ni ninguna operación
destructiva desde el panel.

## Carpetas privadas y backups

Todo lo siguiente vive en `admin/data/` y está en `.gitignore` — nunca se
publica, nunca llega a GitHub:

- `admin/data/backups/` — copia de `cursos.json` antes de cada escritura.
- `admin/data/tmp/` — ficheros temporales de validación en staging y
  bloqueos (`admin/data/tmp/locks/`).
- `admin/data/trash/` — papelera lógica (cursos en borrador retirados,
  restaurables). Puede contener contenido no revisado; se mantiene privada
  a propósito.
- `admin/data/historial/operaciones.jsonl` — registro de operaciones
  administrativas (JSON Lines). Nunca contiene contraseñas, tokens, cookies
  ni el `_csrf`.

## Limitaciones actuales

- Autenticación de un único usuario administrativo (sin roles, sin
  registro de altas/bajas de usuarios).
- El "resumen editorial" (avisos de calidad de contenido) es una capa
  añadida sobre el validador real, no lo sustituye.
- El mensaje de commit se genera con una heurística simple (nombra el
  curso solo si la publicación afecta a una única ficha); no admite texto
  libre sin normalizar.
- No hay integración con la API de GitHub Actions: tras el push, el panel
  no comprueba el resultado del despliegue, solo avisa de que puede tardar
  unos minutos.

## Producción

**No disponible.** Este panel solo publica en `origin/design` (la web de
pruebas en `/design-preview/`). Nunca toca `main` ni la web pública real.
Cualquier promoción de `design` a `main` sigue siendo un paso manual y
consciente fuera de este panel.
