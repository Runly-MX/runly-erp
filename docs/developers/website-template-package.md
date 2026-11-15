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

Atlas 0.6.2 extiende la misma marca con logo a `FooterBlock` y `SiteFooterBlock`: `logoSrc`, `logoAlt`, `logoHeight`, `showBrandName`, `brandDirection`, `brandGap` y `brandHref`. `showBrand` sigue ocultando toda la marca y `tagline` conserva el texto adicional del pie. Para usarlos, el contrato debe anunciar 0.6.2 y se guarda una revisión con ese digest. Los catálogos anteriores permanecen inmutables.

El historial de paquetes guardados no consume el cupo de cinco cargas pendientes sin vincular. Cada revisión retenida sigue contando en la cuota de almacenamiento; un guardado no requiere borrar versiones o assets anteriores.
