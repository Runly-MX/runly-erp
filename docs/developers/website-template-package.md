---
title: Website Template v2 y Atlas
summary: Contrato declarativo, imágenes privadas y edición Website desde Developer Hub y MCP.
order: 22
---

# Website Template v2, Atlas y Developer Hub

Una plantilla editable usa `runly.website-template` v2 y el catálogo Atlas Web Builder 0.3.5 fijado por el validador. Un ZIP de HTML/CSS/JavaScript es un prototipo visual, no una plantilla instalable. El contrato de lectura v1 sin imágenes sigue admitido. No hay un segundo editor HTML.

Consulta `runly_website_contract` para obtener formato, política raster, límites y catálogo reales del validador activo. Descubre publicadores con `runly_resources_list`; crea la identidad `website_template` con `runly_resource_create`. Lee metadata, validaciones y revisiones humanas mediante `runly_resource_get`. `runly_website_get` abre el documento completo y sus revisiones editables; `fileId` selecciona una revisión anterior sin sobrescribirla.

`runly_website_document_save` reutiliza el escritor canónico, almacenamiento privado, historial y validador de Creator. Recibe `expectedRevision` y el documento completo de W2: páginas Atlas, tema portable, assets PNG/JPEG/WebP base64, SHA-256 y licencias. Las imágenes permanecen referidas como `asset:<sha256>`. Exige consentimiento explícito `hub:website:write`; grants anteriores de recursos o Studio no conceden este permiso. Ante conflicto, relee y fusiona los cambios.

El cuerpo MCP completo sigue limitado a 1 MiB. Importar con `runly_website_package_import` admite hasta 640 KiB de ZIP y requiere base64 canónico y SHA-256. Guardar documento admite hasta 900 KiB JSON. El portal mantiene su carga Website hasta 25 MiB y edición posterior con Atlas. El servidor no puede leer rutas, URLs ni archivos privados del chat: proporciona bytes reales o utiliza el portal; nunca inventes base64 ni sustituyas assets locales por URLs externas.

Abrir documentos e imágenes exige `hub:website:read`, un consentimiento separado de la lectura de metadata. `hub:website:write` incluye esa lectura privada. Los grants anteriores de recursos y Studio no adquieren estos permisos automáticamente.

Guardar valida y crea otra revisión privada, sin aprobar ni publicar. Las validaciones quedan ligadas a los bytes, revisión y validador concretos. Imágenes con derechos desconocidos conservan `redistribution: unknown`; el recurso conserva `LicenseRef-Unknown`. Puede editarse y validarse técnicamente, pero no solicitar distribución pública hasta acreditar derechos. La revisión institucional exige autoridad concedida por la plataforma y confirmación humana de la evidencia exacta. MCP no concede autoridad, decide revisiones, firma ni publica.

Los marcadores `@contact` y `@newsletter` no son integraciones. ERP W3 importa como borradores del sitio autorizado, materializa imágenes mediante Files y conserva referencias privadas `file:<id>`. Publicar es otra acción y usa copias inmutables servidas por la release. No se activan agenda, pagos, correo ni automatizaciones al instalar. La apariencia exacta del prototipo y los derechos son requisitos independientes de la compatibilidad técnica.
