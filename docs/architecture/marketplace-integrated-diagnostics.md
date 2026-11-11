# Marketplace integrado: diagnóstico y actualización

## Causa demostrada

El transporte real `readCatalogBytes` recibe HTTP 404 (JSON `RESOURCE_NOT_FOUND`) en los orígenes por defecto de módulos `official` y `community`. El mismo origen entrega HTTP 200 para `resources/index.json`, con Cumbre 1.0.0. La reproducción pudo resolver DNS y establecer TLS.

Antes, todos los HTTP distintos de 200 se convertían en `CATALOG_UNREACHABLE`; el consumidor v2, sin una copia verificada, respondía 502 `catalog_unreachable`. Por eso el 502 no demostraba por sí mismo un problema de red. El ERP no puede comprobar las tablas del publicador: un 404 del origen puede significar falta de snapshot exportado o una ruta no disponible. No se afirma haber inspeccionado esa base ni la configuración interna de la instancia reportada.

Ahora, si los feeds configurados son los de Runly, todos responden 404 y no hay copia utilizable, `GET /module-catalog/v2` devuelve HTTP 200 con `status: 'not_published'`, `verified: false`, `modules: []` y diagnósticos por dominio (`httpStatus: 404`, sin copia verificada). Es un estado de presentación, no un feed vacío firmado ni un veredicto de confianza. La interfaz dice que el origen no ofrece los feeds y mantiene independientes los recursos y los módulos instalados.

Un 404 personalizado, HTTP 5xx, DNS o TLS siguen siendo errores con causa/HTTP en `details`. Un error de esquema, firma, origen permitido o antirollback conserva su rechazo específico. Un dominio válido no queda oculto por el fallo del otro. Si hay una copia verificada admisible, se conserva con las reglas de frescura existentes; no se sustituyen sus datos por un catálogo inventado.

## Studio y feed de recursos

El valor por defecto sigue siendo el índice público de recursos derivado del origen de Runly. `catalog.resources.url` explícito tiene prioridad; el valor vacío desactiva recursos. Se mantienen las claves de `catalog-resource-public-key.js`, el dominio `resource`, la prueba institucional y el consumidor existente. No se incorporaron claves nuevas.

Se verificó en una instancia desechable con las migraciones del ERP, Auth y Storage reales, mismo modo Runly, ninguna sobreescritura de `catalog.resources.url`, transporte HTTPS real y claves incluidas en la versión:

- Módulos: HTTP 404 aguas arriba, estado no publicado y ninguna release inventada.
- `GET /studio/interchange/marketplace/resources`: sesión autenticada, catálogo fresco y Cumbre 1.0.0 elegible, `trust: 'resource'`, `official: true`.
- Usuario sin `studio.view`: HTTP 403.
- `GET /marketplace/resources?type=studio_template`: misma release que Studio, independiente de módulos.
- Descarga original, copia editable, edición y reexportación: 500632 bytes, 2 páginas, 55 capas y 2 recursos; los recursos conservaron sus hashes y el paquete original no cambió.

Si un refresco falla pero existe una copia verificada, la consulta devuelve `catalog.alert` y `catalog.offline` junto con su estado. La confirmación sigue forzando una verificación actual: un refresco fallido o una revocación no pueden confirmarse usando esa copia.

Reproducción del caso actual, sólo en entorno equivalente desechable:

```powershell
$env:RUNLY_MARKETPLACE_ACCEPTANCE_URL='https://devs.runly.mx/api/v1/marketplace/catalog/resources/index.json'
$env:RUNLY_MARKETPLACE_ACCEPTANCE_RESOURCE='studio.cumbre-innovacion-liderazgo-2027'
node scripts/verify-marketplace-imports.mjs
```

Este modo comprueba la condición actual de feeds de módulos no publicados, autoriza Runly sólo en su instancia desechable y no lee `.env` ni modifica producción. El resto de la batería general del script no se ejecuta en este modo.

## Alcance integrado y permisos

`/app/marketplace` es una ruta autenticada bajo la empresa activa, accesible desde el lanzador de aplicaciones. Ofrece Módulos, Plantillas Studio, Automatizaciones, Website y Solutions según los permisos disponibles. Al cambiar de empresa o usuario se desmonta la selección local.

| Tipo | Descubrimiento | Acción |
| --- | --- | --- |
| Módulos | consumidor v2 existente; `core.modules.read` | panel y diálogo existentes; instalar/actualizar sigue requiriendo `core.modules.manage` y autoridad de instancia |
| Studio | puerta E3a; `studio.view` | `StudioImportDialog`, release seleccionada, destino autorizado, revisión y confirmación; siempre una copia |
| Automatizaciones | puerta E3a; `automations.manage` | diálogo existente, revisión y consentimiento; se importan pausadas |
| Website | consumidor de recursos; `website.site.read` | sólo descubrimiento de publicaciones reales; no se habilitó importador |
| Solutions | consumidor de recursos; `core.modules.read` | sólo descubrimiento de publicaciones reales; no se habilitó instalador |

El nuevo GET del ERP es una fachada de lectura de la misma puerta E3a: no duplica la verificación H7, no sirve paquetes y no instala. Su `type` es obligatorio y sus permisos se validan en servidor. El SDK lo expone como `moduleCatalog.resources(type, token)`. Abrir una tarjeta no prepara, importa ni instala nada.

## Configuración normal y avanzada

La configuración normal es **Marketplace de Runly**, con los feeds de módulos y recursos y las claves públicas incluidas en la versión. Las instalaciones nuevas conservan el comportamiento por defecto existente. Las existentes conservan sus filas y preferencias; no hay migración de activación.

La configuración muestra el origen efectivo independiente de recursos. Para cambiarlo hay que marcar **Autorizar también el cambio de origen de recursos**. Sin esa autorización, cambiar el modo de módulos conserva explícitamente el origen efectivo anterior de recursos, incluso si antes provenía de un valor por defecto. Para recursos personalizados se admite `resourcesUrl`; vacío o `null` los desactiva. Elegir Runly con autorización guarda su URL por defecto. La configuración avanzada de módulos, política y claves administradas se mantiene; una clave administrada de módulos no autoriza recursos.

## Procedimiento de actualización

1. Incorporar los commits de este cambio al proceso habitual de publicación del ERP. Construir API y Web de la misma revisión; `pnpm --filter @runly/desktop build:web` valida el bundle local. No se publicaron imágenes ni se hizo despliegue en esta sesión.
2. Cuando se autorice el despliegue, actualizar API y Web conjuntamente mediante el procedimiento de la instalación. Este cambio no requiere una migración de base de datos. Conservar `instance_config`, sus claves y el caché verificado.
3. Como administrador, abrir el lanzador → Marketplace → Configurar Marketplace. Revisar los orígenes efectivos antes de guardar. Para autorizar los tres feeds normales, seleccionar Marketplace de Runly y marcar la autorización de recursos; para conservar el origen actual de recursos, dejarla desmarcada.
4. Comprobar `GET /api/module-catalog/v2`: mientras los feeds de módulos sigan respondiendo 404 y no exista copia, esperar el estado `not_published`, nunca módulos confiables inventados. Un fallo diferente debe conservar su diagnóstico.
5. Con una sesión y empresa autorizadas, comprobar `GET /api/studio/interchange/marketplace/resources` y abrir Plantillas Studio en Marketplace. Seleccionar Cumbre, revisar el destino y confirmar Crear copia. Una falta de permiso, incompatibilidad, integridad inválida o revocación debe impedir la operación.
6. Si hay una URL de recursos anterior vacía o personalizada, no borrarla silenciosamente: revisar y autorizar su cambio. Si aparece `RESOURCE_KEY_UNTRUSTED`, revisar la versión y el trust store; no añadir una clave sólo porque la anunció el feed.

## Validación y límites

Se ejecutaron las pruebas afectadas de disponibilidad, consumidor v2, configuración, permisos, presentación y puerta E3a, además de Chromium con el componente real. La prueba de navegador usa identidad y respuestas sintéticas para comprobar interacción; la verificación de firmas y la importación de Cumbre se prueban por separado contra el feed público y los servicios reales en el entorno desechable.

Resultado: 34/34 pruebas dirigidas aprobadas y 2 comprobaciones de aceptación real aprobadas (endpoints independientes y copia editable). El endpoint autenticado de módulos se comprobó también mediante SDK, sin el 502 del caso reportado. `pnpm check:privacy` global conserva 72 hallazgos ajenos al cambio; el commit se revisa por separado con el mismo analizador.

Lint dirigido y build Web aprobados. React Doctor reporta cinco advertencias: complejidad en el catálogo nuevo y los componentes existentes de módulos/configuración; una advertencia de colecciones de otra sesión; y sincronización de props en `StudioImportDialog`, que no se cambió en este alcance. La revisión de esas ramas y el navegador dirigido no encontraron un fallo funcional. Se conserva también una advertencia anterior de clave duplicada del SDK de Chat al compilar las pruebas; no forma parte de este alcance.

No se repitieron las suites generales, ni se certificaron Firefox/WebKit. No se entró a la instancia productiva reportada ni se desplegó. Los cambios paralelos de colecciones de Studio quedan fuera de estos commits.

## Archivos de integración

- Diagnóstico y configuración: `apps/api/src/services/catalog/catalog-v2-service.js`, `resource-catalog-service.js` y sus pruebas.
- Descubrimiento y refresco: `apps/api/src/routes/catalog-routes.js`, el cableado en `apps/api/src/index.js`, `services/marketplace/marketplace-import-gate.js`, sus pruebas y `packages/sdk/src/domains/module-catalog.js`.
- Entrada y catálogo: `apps/desktop/src/app/MarketplaceScreen.jsx`, `AppEntry.jsx`, `components/AppLauncher.jsx`, los componentes y textos de Marketplace en `modules/runly.core`, y la selección inicial de `MarketplaceAutomationDialog.jsx`.
- Aceptación: `apps/desktop/src/app/__tests__/marketplace-browser.test.js` y `scripts/verify-marketplace-imports.mjs`.
