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

## Tiles de perfil ("Encuentra la formación que encaja")

| Archivo final | Origen | Uso previsto | Dimensiones | Formato | Peso |
|---|---|---|---|---|---|
| `tile-desempleado-700.webp` | `recursos/fotografias/formacion/Estoy desempleado.png` | Tile "Estoy desempleado/a" | 700×1050 | WebP q82 | 71.0 KB |
| `tile-trabajando-700.webp` | `recursos/fotografias/formacion/Estoy trabajando.png` | Tile "Estoy trabajando" | 700×1050 | WebP q82 | 64.7 KB |
| `tile-online-700.webp` | `recursos/fotografias/formacion/Quiero estudiar online.png` | Tile "Estudiar online" | 700×1050 | WebP q82 | 56.4 KB |

Se conserva el encuadre completo del original (proporción 2:3) en un único tamaño; el recorte visual al 3:4 del slot se resuelve en CSS (`object-fit`), no de forma destructiva sobre el archivo.

---

## Resumen de peso

| | Peso |
|---|---|
| Originales seleccionados (14 archivos, banco `/recursos`) | 21.80 MB |
| Assets finales generados (25 archivos, `/web/assets`) | 2.33 MB |
| **Reducción** | **≈ 89.3 %** |

## Pendiente para más adelante (no incluido en esta selección)

No se han copiado recursos marcados como "Falta" o de adecuación dudosa en la auditoría previa (socorrismo, DESA, formación privada, logos de Cruz Roja/Opciónate/Desarrollo Social/A ti Mujer/FSE-Next Gen, PIEC individual, sellos de certificación individuales). Se incorporarán cuando exista material adecuado.
