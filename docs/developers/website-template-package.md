---
title: Website Template v2 y Atlas
summary: Contrato declarativo, imágenes privadas y edición Website desde Developer Hub y MCP.
order: 22
---

# Website Template v2, Atlas y Developer Hub

Una plantilla editable usa `runly.website-template` v2 y un catálogo Atlas Web Builder versionado fijado por el validador. La adopción 0.6.0 agrega composición por elementos y conserva el catálogo histórico 0.3.5 con su digest original. Un ZIP de HTML/CSS/JavaScript es un prototipo visual, no una plantilla instalable. El contrato de lectura v1 sin imágenes sigue admitido. No hay un segundo editor HTML.

Consulta `runly_website_contract` para obtener formato, política raster, límites y catálogo reales del validador activo. Descubre publicadores con `runly_resources_list`; crea la identidad `website_template` con `runly_resource_create`. Lee metadata, validaciones y revisiones humanas mediante `runly_resource_get`. `runly_website_get` abre el documento completo y sus revisiones editables; `fileId` selecciona una revisión anterior sin sobrescribirla.

Si el contrato activo anuncia 0.6.0, usa `builderVersion: "0.6.0"` y su `catalogDigest` exacto para composiciones nuevas. Incluye `BoxBlock`, `TextElementBlock`, `ButtonElementBlock`, `LinkElementBlock` e `ImageElementBlock`, además de las secciones anteriores. Un contenedor admite fila, columna, cuadrícula o `layout: "free"`. Las propiedades de diseño son declarativas: colores, tipografía, bordes, espacios, capas y geometría. Consulta campos y opciones reales; no inventes familias de bloques para reproducir cada diseño.

La posición y el tamaño pueden diferir entre escritorio, tableta y móvil: `position`, `anchorX`, `anchorY`, `offsetX`, `offsetY`, `widthMode`, `width`, `widthPercent`, `heightMode`, `height`, `minHeight` y `rotation`. Los ajustes `tabletPosition`, `mobileOffsetX`, etc. heredan por propiedad de escritorio a tableta a móvil. Omitir una clave restaura la herencia. El árbol, el contenido y su orden son compartidos. El movimiento libre ocurre dentro de contenedores; redimensionar un elemento adaptable conserva el flujo. Navbar ofrece apertura, alineación, colapso y presentación del menú según sus campos. Estilos propios guardables y React empaquetado por el autor requieren contratos adicionales; 0.6.0 no ejecuta código recibido de una plantilla.

Una plantilla 0.3.5 mantiene sus campos y su digest al abrir y guardar. Cambiar el paquete del editor no migra automáticamente el documento. Para adoptar 0.6.0, crea una revisión con el catálogo nuevo, conserva páginas/assets/licencias y valida antes de guardarla. El contrato remoto determina la disponibilidad: una publicación npm por sí sola no actualiza el servicio MCP.

El catálogo 0.6.1 agrega `LogoElementBlock` (Logo y marca): `logoSrc` es una imagen portable, `brand` y `showBrandName` controlan el nombre, `tagline` contiene texto adicional opcional y `brandHref` define su enlace. `brandDirection` admite `row` o `column`, `brandGap` controla la separación y `logoHeight` el alto sin recortar ni deformar la imagen. NavbarBlock y StoreNavbarBlock ofrecen esos mismos campos de marca. Los catálogos 0.3.5 y 0.6.0 se conservan: usa la versión y digest anunciados por el servidor para una nueva revisión que necesite estas propiedades.

`runly_website_document_save` reutiliza el escritor canónico, almacenamiento privado, historial y validador de Creator. Recibe `expectedRevision` y el documento completo de W2: páginas Atlas, tema portable, assets PNG/JPEG/WebP base64, SHA-256 y licencias. Las imágenes permanecen referidas como `asset:<sha256>`. Exige consentimiento explícito `hub:website:write`; grants anteriores de recursos o Studio no conceden este permiso. Ante conflicto, relee y fusiona los cambios.

El cuerpo MCP completo sigue limitado a 1 MiB. Importar con `runly_website_package_import` admite hasta 640 KiB de ZIP y requiere base64 canónico y SHA-256. Guardar documento admite hasta 900 KiB JSON. El portal mantiene su carga Website hasta 25 MiB y edición posterior con Atlas. El servidor no puede leer rutas, URLs ni archivos privados del chat: proporciona bytes reales o utiliza el portal; nunca inventes base64 ni sustituyas assets locales por URLs externas.

Abrir documentos e imágenes exige `hub:website:read`, un consentimiento separado de la lectura de metadata. `hub:website:write` incluye esa lectura privada. Los grants anteriores de recursos y Studio no adquieren estos permisos automáticamente.

Guardar valida y crea otra revisión privada, sin aprobar ni publicar. Las validaciones quedan ligadas a los bytes, revisión y validador concretos. Imágenes con derechos desconocidos conservan `redistribution: unknown`; el recurso conserva `LicenseRef-Unknown`. Puede editarse y validarse técnicamente, pero no solicitar distribución pública hasta acreditar derechos. La revisión institucional exige autoridad concedida por la plataforma y confirmación humana de la evidencia exacta. MCP no concede autoridad, decide revisiones, firma ni publica.

Los marcadores `@contact` y `@newsletter` no son integraciones. ERP W3 importa como borradores del sitio autorizado, materializa imágenes mediante Files y conserva referencias privadas `file:<id>`. Publicar es otra acción y usa copias inmutables servidas por la release. No se activan agenda, pagos, correo ni automatizaciones al instalar. La apariencia exacta del prototipo y los derechos son requisitos independientes de la compatibilidad técnica.

Atlas 0.6.3 incluye la misma marca con logo a `FooterBlock` y `SiteFooterBlock`: `logoSrc`, `logoAlt`, `logoHeight`, `showBrandName`, `brandDirection`, `brandGap` y `brandHref`. `showBrand` sigue ocultando toda la marca y `tagline` conserva el texto adicional del pie. Para usarlos, el contrato debe anunciar 0.6.3 y se guarda una revisión con ese digest. Los catálogos anteriores permanecen inmutables.

El historial de paquetes guardados no consume el cupo de cinco cargas pendientes sin vincular. Cada revisión retenida sigue contando en la cuota de almacenamiento; un guardado no requiere borrar versiones o assets anteriores.

## SVG compatibles: guía para generar y transferir assets

Antes de generar SVG para Website, consulta `runly_website_contract`: debe anunciar `svg` y la política `packaged-media-v2`. El SVG se muestra como imagen (`<img>`), no como código inline. Studio y las capturas de recursos siguen requiriendo formatos raster. Las siguientes reglas describen el sanitizador actual; el contrato del servidor conectado determina las capacidades disponibles.

### Qué puede generar una IA

- XML UTF-8 con una raíz `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`. El `viewBox` es obligatorio, con cuatro números y ancho y alto positivos; usa dimensiones explícitas sencillas.
- Elementos admitidos: `svg`, `g`, `defs`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `text`, `tspan`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `use`, `title`, `desc`, `symbol`. Respeta las mayúsculas de los nombres SVG.
- Atributos de presentación como `fill`, `stroke`, `stroke-width`, `opacity`, `fill-opacity`, `stroke-opacity`, `transform`, `stop-color` y `stop-opacity`. Usa `currentColor` cuando corresponda; no depende de insertar el SVG inline.
- Degradados, máscaras y recortes con IDs locales, por ejemplo `stroke="url(#wave)"` y `<linearGradient id="wave">`. Las referencias deben apuntar a IDs del mismo archivo. Los IDs cumplen `^[A-Za-z_][A-Za-z0-9_.:-]{0,63}$`.
- Reutilización local con `<use href="#shape"/>`; no encadenes referencias a otro `use` ni al ancestro que lo contiene. Evita referencias cíclicas o pendientes.

Prefiere atributos de presentación directos. El atributo `style="fill:#fff;opacity:0.5"` admite únicamente propiedades de la lista permitida y se normaliza a atributos; otras propiedades se descartan. Esto no habilita hojas CSS ni el elemento `<style>`. Atributos desconocidos y metadatos del editor pueden eliminarse: no dependas de ellos para conservar la apariencia.

Ejemplo compatible de una onda con degradado local, sin filtros:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">
  <defs>
    <linearGradient id="wave">
      <stop offset="0" stop-color="#B9F34C" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#B9F34C"/>
      <stop offset="1" stop-color="#B9F34C" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M0 20 C25 0 50 40 100 20" fill="none" stroke="url(#wave)" stroke-width="2"/>
</svg>
```

### Qué se rechaza y cómo evitarlo

`SVG_FORBIDDEN_CONTENT` significa contenido activo **o no soportado**; no demuestra por sí solo que el archivo sea malicioso. La lista permitida es cerrada: un elemento fuera de ella se rechaza, aunque esté dentro de `defs` y nadie lo utilice.

| Construcción | Regla para generar el asset |
|---|---|
| `filter`, `feGaussianBlur` y demás primitivas `fe*` | No generar desenfoques, sombras ni brillos mediante filtros SVG. Para efectos compatibles, usar geometría, opacidades y degradados admitidos. |
| `pattern`, `marker`, `switch` | No soportados. Dibujar la geometría explícitamente; mantener el límite de elementos. |
| `script`, atributos `onload`, `onclick` y cualquier `on*` | Sin JavaScript ni manejadores de eventos. |
| `foreignObject`, HTML, `iframe`, `object`, `embed` | Sin contenido HTML ni documentos incrustados. |
| `image`, `feImage`, `a`, `link` | Sin imágenes incrustadas, enlaces ni dependencias externas. |
| `animate`, `animateTransform`, `animateMotion`, `set` | SVG estático, sin animación SMIL. |
| `<style>`, `@import`, `expression()`, `image()` | Sin hojas CSS ni expresiones; usar atributos de presentación admitidos. |
| URLs HTTP/HTTPS, `data:`, `javascript:`, `vbscript:` | Sin referencias externas ni datos embebidos. `url(#id)` local sí está admitido; `href` solo se admite en `use` con un fragmento local. |
| DOCTYPE, entidades personalizadas, CDATA e instrucciones de proceso | Omitirlas. La declaración XML UTF-8 básica es opcional; preferir empezar directamente con `<svg>`. |

Por ejemplo, `<filter id="gl"><feGaussianBlur stdDeviation="11"/></filter>` provoca `SVG_FORBIDDEN_CONTENT` con detalle `filter`, incluso si no existe ningún `filter="url(#gl)"` que lo aplique. Un filtro sin uso puede eliminarse en una copia autorizada sin cambiar el dibujo; si se usa, rediseñar el efecto puede cambiar la apariencia. No modificar originales rechazados ni convertirlos a PNG sin autorización del usuario.

### Límites, errores y comprobación

Los límites actuales son 256 KiB por SVG, 5 000 elementos, profundidad de 32, lados de hasta 8 192 px según el `viewBox`, y `attrBytes: 32768` anunciado por el contrato; además, el sanitizador limita cada valor de atributo a 8 192 caracteres. Consulta los límites remotos antes de generar archivos grandes.

| Código | Qué comprobar |
|---|---|
| `SVG_INVALID_XML` | UTF-8 válido, una sola raíz, etiquetas bien anidadas, atributos entre comillas y sin duplicados. |
| `SVG_FORBIDDEN_CONTENT` | Elementos y atributos anteriores, protocolos, namespaces, entidades y valores no admitidos; registrar el detalle si está disponible. |
| `SVG_TOO_COMPLEX` | Tamaño, elementos, profundidad, dimensiones y cadenas de `use`. |
| `SVG_NO_VIEWBOX` | `viewBox` presente con cuatro números y dimensiones positivas. |

El sanitizador procesa datos; nunca ejecutar scripts de un SVG para inspeccionarlo. Para transferir, calcular bytes y SHA-256 del archivo real, llamar `runly_website_asset_prepare` con `image/svg+xml`, realizar PUT binario exacto y confirmar con `runly_website_asset_confirm`. La confirmación puede rechazar un archivo que ya se transfirió: registrar el código y continuar con los demás cuando así se haya pedido; no contar un PUT exitoso como asset confirmado.

El Hub conserva el SVG sanitizado: su `sha256`, `bytes` y `websiteReference` pueden diferir del archivo enviado; `provenance.sourceSha256` conserva el hash de origen. Usar siempre el `assetId` y la referencia devueltos, y comprobar la biblioteca con `runly_website_asset_list`. Si se prepara una copia corregida autorizada, calcular de nuevo su tamaño y hash y crear otra transferencia; no reutilizar los del original.

## Licencias de assets: formulario y MCP

En la Biblioteca multimedia del portal, la licencia es opcional: dejarla vacía envía `LicenseRef-Unknown`. Esto permite cargar material sin elegir una licencia pública ni inventar condiciones de uso. El cambio del formulario no vuelve opcional el campo técnico del MCP: `runly_website_asset_prepare` y el servicio de transferencia todavía requieren `license`.

El identificador técnico admite entre 1 y 128 caracteres del conjunto `A-Z`, `a-z`, `0-9`, `.`, `+`, `:`, `-` (expresión `^[A-Za-z0-9.+:-]{1,128}$`). No admite espacios ni texto libre; una frase como «Propiedad del cliente» produce `INVALID_LICENSE`. Usa un identificador SPDX cuando corresponda, por ejemplo `CC-BY-4.0`, o una referencia propia como `LicenseRef-Client-Owned`. Si no se declara licencia, el cliente MCP debe enviar `LicenseRef-Unknown`, como hace el portal.

`LicenseRef-Client-Owned` identifica una declaración propia; no convierte el material en dominio público ni otorga permisos de redistribución. La descripción legible puede conservarse en `provenance.licenseLabel`. `rights.author` indica el autor declarado y `rights.notice` conserva el aviso; `rights.redistribution` se mantiene en `unknown` si no hay autorización expresa. No cambies a `allowed` por haber elegido un identificador o generado una imagen con IA.

Ejemplo de metadata de licencia propia para la preparación, junto con los IDs, MIME, bytes y SHA-256 reales del archivo:

```json
{
  "license": "LicenseRef-Client-Owned",
  "rights": {
    "author": "Cliente",
    "notice": "Material propio del cliente",
    "redistribution": "unknown"
  },
  "provenance": {
    "client": "codex",
    "originalName": "logo.svg",
    "licenseLabel": "Propiedad del cliente"
  }
}
```

La carga privada y la distribución pública son pasos distintos: una licencia sin especificar permite almacenar y editar, pero no acredita derechos para publicar. Consulta el schema MCP expuesto en la conexión antes de omitir campos; que el portal permita dejarlos vacíos no cambia ese contrato.
