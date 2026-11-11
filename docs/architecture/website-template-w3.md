# Website Marketplace W3: instalación en ERP

## Alcance y compatibilidad

W3 incorpora el consumidor `website_template` al Marketplace y a Runly Website. Reutiliza el modelo de sitios/páginas/temas, Files, los borradores revisionados y el servicio de publicación existentes. La operación crea borradores; no firma, aprueba ni publica recursos del Hub. H7, las claves y las reglas de procedencia oficial no cambian. Developer Hub no requiere cambios de código en esta fase.

El formato sigue siendo `runly.website-template` v2 de W1. También se inspecciona v1 sin imágenes empaquetadas con el mismo validador. No hay un ZIP ERP alternativo ni otro constructor. Atlas permanece fijado a 0.3.5, con 148 bloques y digest `0e6f77787d7351448f05dc87af8b1f2bb701170a1077eacc76633d548216d248`; regenerar el catálogo no cambia sus bytes. W2 continúa produciendo el paquete de entrada.

Elevate conserva el candidato W2: 552600 bytes, SHA-256 `0357fe46788bbf78b4dbdc68a1818707f240466d45fb82c29f52539be1fe6b4f`, una página, 133 bloques y las 16 imágenes originales, incluidas las no utilizadas. Su licencia permanece desconocida (`license_unknown` / `LicenseRef-Unknown`). La validación técnica no autoriza redistribución ni procedencia Oficial Runly.

## Contratos y flujo

El catálogo firmado E2 y `marketplace-import-gate.js` son la única entrada de paquetes. El navegador proporciona `{resourceKey, version, releaseId, acknowledgeStale}`; no proporciona ZIP, URL de descarga, bucket o identidad del publicador. El consumidor comprueba firmas, cadena del feed, elegibilidad, compatibilidad, tamaño y SHA-256. La confirmación vuelve a descargar/inspeccionar y exige un feed verificado en ese momento antes de preparar archivos y antes de confirmar SQL. Un feed inaccesible o con alertas no demuestra vigencia.

Rutas bajo `/website`, con autenticación y empresa activa existentes:

| Ruta | Contrato |
| --- | --- |
| `GET /marketplace/resources` | Descubrimiento verificado de Website; requiere lectura del sitio |
| `POST /sites/:siteId/marketplace/inspect` | Ref exacta; devuelve páginas, conflictos, revisión esperada, tema, imágenes y avisos |
| `POST /sites/:siteId/marketplace/install` | Ref, `pageIds` (rutas seleccionadas), `expectedRevision`, `includeTheme`, `replaceExisting`, `formMode`, `acceptWarnings: true`; exige `Idempotency-Key` |
| `GET /sites/:siteId/template-assets` | Inventario autorizado de imágenes privadas del sitio, sin claves de almacenamiento |
| `GET /sites/:siteId/template-assets/:fileId` | Bytes verificados, MIME raster y `nosniff`; respuesta privada `no-store` |

La inspección y la instalación requieren lectura del sitio y creación de páginas. Instalar imágenes exige `files.assets.create`; cambiar tema exige actualización de sitio y tema; seleccionar inicio exige actualización de sitio; sustituir exige actualización y eliminación de páginas. Se conservan los aliases existentes de permisos Website, incluidos formularios. El servidor comprueba pertenencia del sitio a la empresa, además del middleware de permisos.

El diálogo permite seleccionar sitio y páginas, revisar preview y conflictos, aceptar avisos, instalar y abrir Atlas. Marketplace ofrece «Usar en Website» cuando existen módulo y permisos; los otros tipos conservan sus flujos actuales. Las soluciones que sólo admiten descubrimiento siguen siendo informativas.

## Preparación, confirmación y compensación

La migración `20261111193229_website_template_marketplace` añade únicamente el diario SQL `website_template_job`. No introduce otro modelo de páginas ni requiere un modelo Prisma generado. RLS está habilitado y forzado; PUBLIC, anon y authenticated no pueden operar sobre el diario. Lo utiliza el backend con su conexión existente.

1. Autorizar, inspeccionar con W1, validar selección y rutas reservadas, comprobar revisión y permisos. No sustituir rutas silenciosamente.
2. Bajo bloqueo de empresa y sitio, registrar hash de solicitud, identidad exacta del recurso y clave de idempotencia. Límite: cuatro operaciones preparando/limpiando por empresa y veinte intentos por actor/empresa/hora.
3. Revalidar y reutilizar sólo imágenes privadas habilitadas del mismo sitio/empresa, con acceso Files autorizado, hash, bytes y MIME coincidentes. Sin privilegio administrativo, la búsqueda de reutilización se limita al mismo autor.
4. Para cada nueva imagen, usar `Files.upload` en modo staging. Su hook persiste bucket/objectKey exactos ANTES de subir. Conservar SHA-256, origen y licencia en metadata. No depender de archivos temporales ni URLs de Hub.
5. Volver a comprobar vigencia del recurso. En una transacción, bloquear sitio y diario, comprobar CAS y archivos reutilizados, crear FileAssets, materializar `asset:<sha256>` a `file:<id>` con el preparador W1 y aplicar páginas/tema/formularios con el servicio local existente. Guardar recibo, resultado y auditoría en la misma transacción.
6. Ante fallo, rollback SQL y eliminación de objetos exactos del diario. Si Storage no responde, conservar estado `cleanup` para recuperación; no afirmar éxito. El reaper corre cada minuto, con lease de dos minutos y heartbeat cada treinta segundos. Procesa lotes de 32 y conserva tombstones de limpieza durante un día para volver a comprobar uploads tardíos.

Un replay confirmado con la misma clave y cuerpo devuelve el resultado previo sin duplicar páginas ni archivos. Cambiar el cuerpo con esa clave falla. Una operación en curso se reintenta con la misma selección; una cancelada requiere volver a inspeccionar y una clave nueva. El diálogo genera esa clave al inspeccionar. No hay una transacción distribuida entre SQL y Storage: el diario es el mecanismo verificable de recuperación.

El inventario de eliminación de empresas ya descubre las filas por `company_id` y sus dependencias. Ahora incluye también los objetos staged del diario antes de eliminar metadata; los objetos con FileAsset siguen el inventario existente. No se debe borrar manualmente el diario para liberar una instalación bloqueada.

## Atlas, imágenes y borradores

Atlas recibe los mismos árboles, propiedades, textos, fondos, enlaces y SEO compatible. Las páginas se crean en el orden del manifiesto y el recibo conserva ese orden. El modelo Website no tiene una columna de orden arbitrario de páginas: la pantalla existente puede listar por fecha descendente; la navegación sigue siendo declarativa en los bloques y menús. No se inventa un orden persistente paralelo.

El editor nativo resuelve las imágenes mediante las rutas autorizadas y las presenta como data URLs efímeras. Invierte ese mapa antes de guardar, conservando `file:<id>`. No guarda enlaces firmados ni expone buckets. Su biblioteca privada permite seleccionar las imágenes ya importadas; no añade una vía de carga pública ni incorpora imágenes externas del paquete. Los metadatos de medios que añade Atlas no se escriben como propiedades incompatibles.

El guardado usa el PUT revisionado existente de página y añade opcionalmente `themeTokens` y `expectedSiteRevision`: página y nuevo tema de borrador se guardan juntos, con CAS e idempotencia. No se muta el registro de tema de una release activa. La ruta `?draft=1` conserva el editor dentro del ERP y separa la acción de publicación. Undo/redo siguen perteneciendo a Atlas; no se promete historial entre sesiones.

La preparación W1 y el materializador de releases admiten ahora fondos `background.url` con `file:`. El renderer compartido aplica `font.heading` a los encabezados. Se preservan los tokens tipográficos, pero no se empaquetan ni descargan nuevas fuentes: su apariencia depende de las fuentes disponibles y los fallbacks existentes. No se añaden bloques, variantes o HTML/CSS/JS arbitrarios al contrato.

El preview usa el renderer declarativo confiable dentro del diálogo, con enlaces detenidos y bloques dinámicos desconectados. No ejecuta contenido del ZIP ni ofrece acceso al código del paquete. No sustituye el preview aislado de W2 ni el sistema de publicación pública de ERP.

## Formularios y contenido público

Por defecto se conservan `@contact` y `@newsletter` como marcadores desconectados. Los bloques no se eliminan para aparentar compatibilidad. Publicar con marcadores sin resolver falla explícitamente con 422. La opción de formularios locales usa los servicios y scopes Website existentes, exige permiso y crea formularios nuevos sin leads, correo, pagos, agenda, automatizaciones o destinos externos. Evita heredar conexiones de un formulario previo. Las plantillas locales anteriores conservan su comportamiento existente.

La instalación no cambia `activeReleaseId` ni el manifiesto sellado existente. Los sitios heredados que todavía sirven páginas publicadas sin una release sellada quedan bloqueados ANTES de subir archivos: deben sellar primero una versión base con su flujo de publicación existente. Así la sustitución de borradores no cambia accidentalmente la ruta pública histórica.

Al publicar después mediante el servicio existente, las imágenes se copian como objetos inmutables en el bucket privado de releases y se sirven por el gateway de esa release/dominio. Las referencias privadas `file:` no aparecen en el documento público. No se vuelve público el bucket Files ni se expone su objectKey.

## Archivos y responsabilidades

| área | Archivos |
| --- | --- |
| Importación y compensación | `apps/api/src/services/marketplace/website-import-service.js`, migración del diario |
| Rutas y montaje | `apps/api/src/routes/website/{marketplace-routes,index,pages-routes,validators}.js`, `apps/api/src/index.js` |
| Reutilización de Website | `website-template-service.js`, `website-template-forms.js`, `website-template-preparation-service.js`, `website-draft-service.js`, `website-release-service.js` |
| Eliminación de empresa | `apps/api/src/services/company-deletion-inventory.js` |
| Cliente y UI | `packages/sdk/src/domains/website.js`, MarketplaceScreen, MarketplaceResourcePicker, WebsitePagesScreen, WebsitePageEditorScreen, `MarketplaceWebsiteDialog.jsx`, `usePrivateWebsiteAssets.js` |
| Renderer compartido | `packages/website-blocks/src/{index.js,typography.css}` |
| Dependencias | `apps/desktop/package.json`, `pnpm-lock.yaml` |
| Evidencia reproducible | `scripts/verify-website-marketplace.mjs`, `scripts/fixtures/website-marketplace/`, test del preparador W1; salida privada ignorada `.artifacts/website-w3/` |

## Pruebas dirigidas y reproducción

Compilar desktop y ejecutar la aceptación con una imagen API local existente que contenga las migraciones anteriores a W3:

```powershell
pnpm --filter @runly/desktop build:web
node scripts/verify-website-marketplace.mjs --api-image <imagen-api-local>
node --test apps/api/src/services/__tests__/website-template-preparation.test.js
node scripts/generate-website-block-catalog.mjs
```

El runner usa la infraestructura desechable de pruebas Studio, sin leer `.env` de la aplicación. Crea Auth, SQL y Storage locales reales y aplica la nueva migración sobre esa base aislada. Reutiliza el ZIP W2 del Hub; `--package` permite indicar su copia local. El feed usa una clave Ed25519 efímera fijada sólo al consumidor de prueba, con firma real de recurso/snapshot y publicador comunitario no verificado. No crea una atestación oficial ni desactiva firmas.

La aceptación comprueba bytes y licencias de las 16 imágenes, 133 bloques, reapertura con texto/imagen/color, HTTP privado y empresa ajena, revisión obsoleta, permisos, conflictos, deduplicación, fallos de subida y limpieza, recuperación del diario, rollback SQL, formularios, publicación aislada y preservación de la release activa. Incluye revocación firmada entre staging y commit y regresión de una plantilla local. El navegador monta los componentes reales con una sesión Auth real del entorno desechable. La publicación se comprueba únicamente en el namespace `.test`, sin DNS ni despliegue productivo.

Los resultados y capturas locales se conservan en `.artifacts/website-w3/acceptance.json` y `.artifacts/website-w3/browser/`. No contienen una autorización de publicación ni se incorporan al repositorio público. La copia `website.elevate-wellness-v2.zip` de esa carpeta conserva exactamente los bytes del candidato W2.

Resultado local: 16 comprobaciones integradas aprobadas; tres tests del preparador aprobados; lint dirigido y build web aprobados; catálogo regenerado sin cambios. Chromium comprobó la carga de todas las imágenes, ausencia de desbordamiento horizontal y el uso de `font.heading` en 1440, 768 y 390 px. El candidato original no declara fuentes; la prueba añade una fuente distinta sólo al borrador desechable de publicación, sin alterar el ZIP.

React Doctor revisó 20 archivos cambiados sin errores; quedan once advertencias de rendimiento y complejidad. Los uploads y pasos SQL del diario son secuenciales deliberadamente para registrar cada intención antes de actuar y preservar la transacción. Las búsquedas de arrays están limitadas por los máximos del contrato; no se amplió el alcance para optimizaciones generales. El chequeo global de privacidad conserva 72 hallazgos heredados ajenos; el análisis individual de los 30 archivos W3 da cero hallazgos. No se añadieron excepciones. El bundle de pruebas también informa la clave duplicada `assignOperator` ya existente en el dominio chat del SDK y el build mantiene avisos de tamaño de chunks; no forman parte de esta entrega.

## Distribución posterior, con autorización

1. Distribuir una revisión coherente de `studio-interchange` con los entrypoints W1/W2, de `website-blocks` incluyendo el CSS compartido, y del SDK con sus tres métodos Marketplace Website. Mantener Atlas 0.3.5 y comprobar el mismo digest. Usar el flujo existente de artefactos verificables; no editar ni falsificar `shared-packages.lock.json` del Hub.
2. En Hub, regenerar/adoptar el snapshot del editor y el root del validador desde esa revisión mediante las herramientas W2. El snapshot local anterior no se actualiza solo. Configurar los orígenes aislados HTTPS del editor y padre cuando se autorice el despliegue. No publicar nuevas versiones de paquetes por cuenta propia.
3. En ERP, aplicar la nueva migración con el proceso normal, desplegar API y web de la misma revisión y reconstruir runtime público/SSR. Mantener privados los buckets Files y releases. No se requieren cambios H7 ni políticas permisivas de Storage. Las imágenes Docker deben incluir los manifiestos workspace corregidos en `42c138dd2`; reconstruirlas, no copiar fuentes a contenedores activos.
4. Comprobar permisos, feed verificado vigente, operación de reaper y base sellada para sitios públicos heredados. Resolver derechos de redistribución antes de solicitar publicación de Elevate. El feed firmado del laboratorio no debe copiarse a configuración productiva.

La fidelidad exacta al prototipo sigue pendiente según W2: overlays, tarjetas, teléfono y variantes específicas requieren trabajo de catálogo compartido, no parches HTML dentro de la plantilla. No se certifican aquí el despliegue VPS, el proceso H7 de release, suites generales ni publicación oficial. No se hizo push ni despliegue.
