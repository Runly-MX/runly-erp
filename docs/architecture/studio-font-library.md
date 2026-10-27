# Studio — familias, pesos y cursivas locales

El catálogo ofrece 29 opciones de familia (28 fuentes distribuidas más Sistema),
297 combinaciones familia/estilo y 95 archivos TTF originales. Son archivos locales
con licencia OFL-1.1; no se consulta Google Fonts durante el uso del editor.

## Pesos de una misma familia

| Nombre habitual | Etiqueta del editor | Peso CSS |
|---|---|---:|
| Thin | Fina | 100 |
| Extra Light | Extraligera | 200 |
| Light | Ligera | 300 |
| Regular / Normal | Regular | 400 |
| Medium | Media | 500 |
| Semi Bold | Seminegrita | 600 |
| Bold | Negrita | 700 |
| Extra Bold | Extranegrita | 800 |
| Black | Negra | 900 |

Lato, Poppins, Montserrat, Raleway, Inter, Roboto, DM Sans y Bitter tienen los
nueve pesos, tanto normales como cursivos: **18 estilos por familia**.
Las claves persistidas son `thin`, `extralight`, `light`, `regular`, `medium`,
`semibold`, `bold`, `extrabold`, `black`; las combinaciones cursivas usan
`thinItalic`, `extralightItalic`, `lightItalic`, `italic`, `mediumItalic`,
`semiboldItalic`, `boldItalic`, `extraboldItalic`, `blackItalic`.

No todas las familias ofrecen nueve pesos. Open Sans tiene 300–800; Source Sans 3
y Nunito, 200–900; Merriweather, 300–900; JetBrains Mono, 100–800; IBM Plex Mono,
100–700. El selector solo ofrece lo que realmente admite cada archivo. Las
fuentes caligráficas como Pacifico o Great Vibes pueden tener un único estilo
original; no se inventan negritas ni cursivas para ellas.

El tamaño continúa siendo independiente del peso: texto editable de 8–500 px,
con las transformaciones ya admitidas por el documento. No hay migración ni
cambio de estructura JSON. API y Web deben usar el mismo catálogo actualizado.

## Familias

Se amplían los estilos de las familias existentes: Lato, Montserrat, Poppins,
Raleway, Nunito, Playfair Display, Lora, Oswald, Dancing Script y Space Mono.
Bebas Neue y Pacifico conservan su estilo original.

Se incorporan Inter, Roboto, Open Sans, Source Sans 3, DM Sans, Merriweather,
Libre Baskerville, Cormorant Garamond, Bitter, Caveat, Kalam, Great Vibes,
Sacramento, Lobster, JetBrains Mono e IBM Plex Mono.

## Procedencia y verificación

Origen: [repositorio oficial Google Fonts](https://github.com/google/fonts),
commit fijo `e7db6ca603fd4862010383ff17ffd6cc4ffac1c0`.
`apps/desktop/public/studio-fonts/sources.json` registra archivos, URL original,
SHA-256, tamaño, variantes, licencia y referencia al METADATA.pb de cada familia.
Los TTF no se modifican ni se generan pesos sintéticos. En fuentes variables se
verifica el rango real del eje `wght`; en estáticas se utiliza la cara original.
Las cabeceras históricas 250/275 de Lato/Poppins Thin/ExtraLight se conservan:
Google Fonts las publica como pesos CSS 100/200 en su METADATA.pb.
Las licencias conservan su contenido y se almacenan con finales de línea LF para
verificar el mismo hash en Windows/Linux; se registra también el hash del original
descargado. La carpeta fija estos atributos en su `.gitattributes`.

```sh
node scripts/verify-studio-fonts.mjs
node --test apps/shared/studio/fonts.test.js
node scripts/verify-studio-font-weights.mjs
node scripts/verify-studio-browser.mjs
```

La comprobación offline valida hashes, licencias, pesos y glifos españoles en
todos los archivos. Chrome carga los 297 estilos y compara los píxeles de Thin,
Regular, Bold, Extra Bold, Black y Bold Italic en Lato/Poppins/Inter/Montserrat.
La prueba de UI selecciona pesos y negrita cursiva, cambia el tamaño y exporta
PNG con Fabric. Sus resultados y captura quedan en
`.artifacts/studio/font-weights/`, fuera de Git.

Validación de esta ampliación: 48 pruebas compartidas/historial aprobadas, carga
real de los 297 estilos en Chrome, selección de los 18 estilos de Inter, tamaños,
PNG y reapertura con PNG idéntico. También pasó la batería gráfica existente.
El escaneo React Doctor concurrente señala `StudioWorkspace.jsx` y otros archivos
en desarrollo por otra sesión; ningún diagnóstico corresponde al control de texto
modificado aquí. No se certifica esa UI multipágina todavía en desarrollo.
