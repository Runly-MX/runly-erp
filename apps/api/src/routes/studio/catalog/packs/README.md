# Colecciones de ilustraciones incluidas

Cada subcarpeta es una colección: `packs/<id>/manifest.json` y `packs/<id>/assets/*`.
Incluidas hoy: `open-doodles` (12) y `open-peeps` (12), de Pablo Stanley, CC0. Se generan con
`node scripts/import-studio-illustration-pack.mjs <open-doodles|open-peeps> <N>`, que solo sigue los
botones de descarga de las páginas oficiales, valida cada SVG, calcula SHA256 y guarda la
declaración de licencia (`PROVENANCE.md`) y el texto CC0. Revisa el diff antes de hacer commit.
Para otra colección CC0, añade su origen en el script o escribe el manifiesto a mano:

```json
{
  "id": "open-doodles",
  "name": "Open Doodles",
  "author": "Pablo Stanley",
  "sourceUrl": "https://www.opendoodles.com/",
  "license": { "id": "CC0-1.0", "url": "https://creativecommons.org/publicdomain/zero/1.0/",
    "evidenceUrl": "https://www.opendoodles.com/", "verifiedAt": "AAAA-MM-DD" },
  "assets": [{ "id": "dance", "title": "Baile", "file": "assets/dance.svg", "tags": ["baile"], "sha256": "..." }]
}
```

Reglas que el servidor aplica (una colección que falle una sola se rechaza completa):

- `license.id` solo puede ser `CC0-1.0`, con su URL canónica, `evidenceUrl` HTTPS y fecha.
- `id` de colección igual al nombre de la carpeta; archivos `assets/<nombre>.svg|png|webp|jpg`, hasta 2 MiB y 500 por colección.
- El SHA256 de cada archivo debe coincidir con el manifiesto.
- SVG: sin scripts, estilos, `foreignObject`, `use`, `image`, enlaces, `data:` ni referencias externas.
  Nunca se importa como geometría editable: se rasteriza a PNG en el servidor (máx. 1600 px) y
  ese PNG privado es lo único que llega a Files, solo cuando el usuario importa.
- PNG/WebP/JPG: firma, formato y decodificación completa comprobados, hasta 25 megapíxeles.

El hash de los archivos incluidos no depende de ninguna descarga en tiempo de ejecución.
