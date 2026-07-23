# Inventario de assets — `/web/assets`

Assets seleccionados del banco `/recursos` (fuera de Git, ver `.gitignore`), optimizados para uso en la V2.1 del rediseño. Ninguna imagen se ha ampliado por encima de su resolución original.

Generados con [sharp](https://sharp.pixelplumbing.com/) — fotografías a WebP (calidad 82), logos a PNG optimizado (compresión máxima; paleta cuantizada solo en los logos de organismos, sin degradación visible).

## Marca

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `logo-cem.png` | `recursos/marca/logo-web.png` | Logo header y footer | 800×184 | PNG (alpha) | 118.0 KB |

## Organismos / financiadores

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `logo-sepe.png` | `recursos/organismos/logo_SEPE.jpg` | Logo colaborador SEPE | 1206×250 | PNG (paleta) | 57.9 KB |
| `logo-sce.png` | `recursos/organismos/logo_SCE.JPG` | Logo colaborador Servicio Canario de Empleo | 700×243 | PNG (paleta) | 23.2 KB |
| `logo-fse.png` | `recursos/marca/logo FSE_Next Generation EU.png` | Logo colaborador Fondo Social Europeo / Next Generation EU | 700×183 | PNG (alpha) | 50.1 KB |
| `logo-piec.png` | `recursos/organismos/logo_PIEC.jpg` | Logo colaborador PIEC (Plan Integral de Empleo de Canarias) | 700×392 | PNG | 72.2 KB |

## Colaboradores

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `logo-cruzroja.png` | `recursos/colaboradores/cruz roja.png` | Logo colaborador Cruz Roja | 745×232 | PNG (paleta) | 6.2 KB |
| `logo-opcionate.png` | `recursos/colaboradores/opcionate.png` | Logo colaborador Opciónate | 742×150 | PNG (paleta) | 12.0 KB |
| `logo-desarrollosocial.png` | `recursos/colaboradores/desarrollo social.png` | Logo colaborador Desarrollo Social | 498×277 | PNG (alpha) | 48.8 KB |
| `logo-atimujer.png` | `recursos/colaboradores/a ti mujer.jpg` | Logo colaborador A ti Mujer | 912×456 | PNG (paleta) | 113.3 KB |

*(`logo-atimujer.png` pesa más que su original JPEG de 64 KB: la regla de no servir logos en JPEG obliga a reencodear a PNG, y el degradado/sombra ya presente en el JPEG de origen no cuantiza tan bien como un gráfico plano. Sigue siendo un peso razonable para un logo — no requiere una segunda pasada.)*

## Certificaciones

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `logo-iso9001-sgs.png` | `recursos/certificaciones/ISO 9001 · Kiwa.png` | Logo certificación ISO 9001 | 600×586 | PNG (alpha) | 97.3 KB |

**Importante:** pese a que el archivo original se llama "ISO 9001 · Kiwa.png", el sello impreso en la propia imagen identifica a **SGS** ("SYSTEM CERTIFICATION · SGS"), no a Kiwa. El archivo final se ha nombrado `logo-iso9001-sgs.png` para reflejar la entidad certificadora real. **Esta corrección todavía no se ha aplicado al texto del placeholder en `design/Home.dc.html` / `web/index.html`** (sigue diciendo `[LOGO: ISO 9001 · Kiwa]`) — queda pendiente de la próxima integración de diseño, donde debe sustituirse "Kiwa" por "SGS".

## Hero

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `hero-800.webp` | `recursos/fotografias/metodología.jpg` | Hero — variante mobile/tablet | 800×450 | WebP q82 | 38.5 KB |
| `hero-1200.webp` | ídem | Hero — variante desktop | 1200×675 | WebP q82 | 72.2 KB |
| `hero-1920.webp` | ídem | Hero — variante desktop grande / retina | 1920×1080 | WebP q82 | 152.0 KB |

## Confianza (sección "Por qué CEM")

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `confianza-800.webp` | `recursos/fotografias/formacion/Nuestra forma de formar.jpg` | Foto de fondo confianza — mobile/tablet | 800×450 | WebP q82 | 40.8 KB |
| `confianza-1200.webp` | ídem | Foto de fondo confianza — desktop | 1200×675 | WebP q82 | 74.2 KB |
| `confianza-1920.webp` | ídem | Foto de fondo confianza — desktop grande | 1920×1080 | WebP q82 | 152.0 KB |

## Docentes / metodología (value prop)

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `docentes-metodologia-800.webp` | `recursos/fotografias/formacion/Metodología.png` | VP "Docentes especializados" — mobile/tablet | 800×500 | WebP q82 | 38.7 KB |
| `docentes-metodologia-1200.webp` | ídem | VP "Docentes especializados" — desktop | 1200×751 | WebP q82 | 66.1 KB |

*(No se genera variante 1920: el original (1586 px) es más estrecho; ampliarlo introduciría pérdida de calidad.)*

## Presencial y online (value prop)

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `aula-teleformacion-800.webp` | `recursos/fotografias/formacion/aula equipada y conexión de teleformación.jpg` | VP "Presencial y online" — mobile/tablet | 800×533 | WebP q82 | 46.1 KB |
| `aula-teleformacion-1200.webp` | ídem | VP "Presencial y online" — desktop | 1200×800 | WebP q82 | 81.3 KB |
| `aula-teleformacion-1920.webp` | ídem | VP "Presencial y online" — desktop grande | 1920×1280 | WebP q82 | 163.3 KB |

Original de 3000×2000 px, el más grande procesado hasta ahora — justifica las tres variantes responsive sin ampliar. Aún no integrado en `design/Home.dc.html`.

## Sedes

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `sede-vecindario-800.webp` | `recursos/fotografias/sedes/Sede Vecindario.jpg` | Sede Vecindario — mobile/tablet | 800×450 | WebP q82 | 65.8 KB |
| `sede-vecindario-1200.webp` | ídem | Sede Vecindario — desktop | 1200×675 | WebP q82 | 141.0 KB |
| `sede-vecindario-1920.webp` | ídem | Sede Vecindario — desktop grande | 1920×1080 | WebP q82 | 327.4 KB |
| `sede-maspalomas-800.webp` | `recursos/fotografias/sedes/Sede Maspalomas.png` | Sede Maspalomas — mobile/tablet | 800×450 | WebP q82 | 93.2 KB |
| `sede-maspalomas-1200.webp` | ídem | Sede Maspalomas — desktop | 1200×675 | WebP q82 | 194.4 KB |
| `sede-tenerife-800.webp` | `recursos/fotografias/sedes/Sede Tenerife.png` | Sede Santa Cruz de Tenerife — mobile/tablet | 800×492 | WebP q82 | 70.9 KB |
| `sede-tenerife-1200.webp` | ídem | Sede Santa Cruz de Tenerife — desktop | 1200×737 | WebP q82 | 152.9 KB |

*(Maspalomas y Tenerife no tienen variante 1920: sus originales, 1672 px y 1600 px respectivamente, son más estrechos que 1920.)*

## Prácticas (value props)

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `practicas-hosteleria-800.webp` | `recursos/fotografias/formacion/practicas hosteleria.png` | VP "Prácticas en empresa" — mobile/tablet | 800×533 | WebP q82 | 62.5 KB |
| `practicas-hosteleria-1200.webp` | ídem | VP "Prácticas en empresa" — desktop | 1200×800 | WebP q82 | 101.4 KB |
| `practicas-administracion-800.webp` | `recursos/fotografias/formacion/practicas administracion.png` | VP "Alumnado en prácticas reales" — mobile/tablet | 800×533 | WebP q82 | 64.4 KB |
| `practicas-administracion-1200.webp` | ídem | VP "Alumnado en prácticas reales" — desktop | 1200×800 | WebP q82 | 114.4 KB |

*(Sin variante 1920 en ninguna: el original, 1536 px, es más estrecho.)*

## Cursos destacados

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `curso-socorrismo-800.webp` | `recursos/fotografias/alumnado/socorrismopiscina.png` | Curso "Socorrismo en instalaciones acuáticas" — mobile/tablet | 800×533 | WebP q82 | 77.1 KB |
| `curso-socorrismo-1200.webp` | ídem | Curso "Socorrismo en instalaciones acuáticas" — desktop | 1200×800 | WebP q82 | 136.9 KB |
| `curso-desa-800.webp` | `recursos/fotografias/alumnado/DESAdesfibrilador.png` | Curso "DESA · Desfibrilador semiautomático" — mobile/tablet | 800×600 | WebP q82 | 52.7 KB |
| `curso-desa-1200.webp` | ídem | Curso "DESA · Desfibrilador semiautomático" — desktop | 1200×900 | WebP q82 | 91.8 KB |

*(Sin variante 1920 en ninguna: los originales, 1536 px y 1448 px, son más estrechos. Ambas fotos sirven tanto para la tarjeta destacada (16:10) como para la miniatura secundaria (120px), según qué curso quede primero al filtrar.)*

## Tiles de perfil ("Encuentra la formación que encaja")

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `tile-desempleado-700.webp` | `recursos/fotografias/formacion/Estoy desempleado.png` | Tile "Estoy desempleado/a" | 700×1050 | WebP q82 | 71.0 KB |
| `tile-trabajando-700.webp` | `recursos/fotografias/formacion/Estoy trabajando.png` | Tile "Estoy trabajando" | 700×1050 | WebP q82 | 64.7 KB |
| `tile-online-700.webp` | `recursos/fotografias/formacion/Quiero estudiar online.png` | Tile "Estudiar online" | 700×1050 | WebP q82 | 56.4 KB |
| `tile-privada-900.webp` | `recursos/fotografias/formacion/formacion privada.png` | Tile "Formación privada" | 900×600 | WebP q82 | 69.5 KB |

Se conserva el encuadre completo del original en un único tamaño; el recorte visual al 3:4 del slot se resuelve en CSS (`object-fit`/`object-position`), no de forma destructiva sobre el archivo. `tile-privada-900.webp` procede de una foto horizontal (3:2) — a diferencia de las otras tres, que ya son verticales — por lo que requiere un `object-position` deliberadamente desplazado a la derecha para conservar a la formadora y la pantalla dentro del recorte (ver nota de encuadre en el informe de integración).

---

## Resumen de peso

| | Peso |
|---|---|
| Originales seleccionados — 1ª tanda (14 archivos) | 21.80 MB |
| Originales seleccionados — 2ª tanda (8 archivos: socorrismo, DESA, formación privada, FSE, Cruz Roja, Opciónate, Desarrollo Social, A ti Mujer) | 6.93 MB |
| Originales seleccionados — 3ª tanda (3 archivos: aula/teleformación, PIEC, ISO 9001/SGS) | 0.85 MB |
| **Originales seleccionados, total (25 archivos, banco `/recursos`)** | **29.57 MB** |
| Assets finales generados (40 imágenes, `/web/assets`) | 3.42 MB |
| **Reducción** | **≈ 88.4 %** |

## Procesado pero aún no integrado en el diseño

Los 3 assets de esta tanda (`aula-teleformacion-*.webp`, `logo-piec.png`, `logo-iso9001-sgs.png`) están optimizados y disponibles en `/web/assets`, pero **todavía no se han enlazado** en `design/Home.dc.html` ni en `web/index.html` — esos archivos siguen mostrando sus placeholders originales (`[FOTO: aula equipada y conexión de teleformación]`, `[LOGO: PIEC]`, `[LOGO: ISO 9001 · Kiwa]`). La integración de diseño, incluyendo la corrección de texto "Kiwa" → "SGS", queda pendiente para un paso posterior.

## Pendiente para más adelante (sin recurso todavía)

Siguen sin recurso adecuado y se conservan como placeholder: cursos "Inserción laboral" y "Ofimática" (aunque ya existen candidatos en `/recursos` sin seleccionar todavía — `sesion de orientacion laboral.png`, `alumnado en aula de informatica.png`), testimonio de alumnado egresado y el dato del número total de sedes activas. Se incorporarán cuando se confirme el material o dato adecuado — no se ha forzado ninguno.
