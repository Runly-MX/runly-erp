# Website: finalización funcional del frontend por sitio

Base `12dd895f097db574adc1518c9e0c704d7cd35110`, rama `website-functional-frontend`. Sin cambios de backend, migraciones, SDK ni Commerce. Website completo sigue **NO APTO E2E**.

## Qué quedó terminado

| Área | Estado | Cómo se comporta |
|---|---|---|
| Blog por sitio | Terminado | Lista, categorías y entradas del sitio elegido. El editor vive en `/sites/:siteId/blog/:postId` y usa el contrato vigente: lectura sin envoltorio `data`, `POST …/save-draft` con `expectedRevision` e `Idempotency-Key`. Tema del sitio de la entrada. La hoja de publicación lista las entradas y envía `publishPostIds`; las entradas ya publicadas conservan su última versión. |
| Tema y Menús por sitio | Terminado | `siteId` explícito en ambas pantallas. Elegir tema en un sitio con versiones se guarda en el borrador de identidad (`PATCH` con revisión) y llega al publicar; sin `siteId` (ruta histórica) conserva el comportamiento anterior. |
| Configuración por sitio | Terminado | Identidad (ya existente), más “Correo y analítica” y “Pagos” dentro del sitio. La fuente/ZIP histórica queda fuera del espacio por sitio (la reemplaza Importar ZIP). El SMTP se declara como de la empresa. |
| Catálogo | Terminado con los límites de abajo | Sección “Catálogo”: productos publicados en la web, disponibles para publicar, publicar y quitar de la web (comando del propio Catálogo, sin tocar `pos_enabled`), imagen/categoría/precio/existencias desde Catálogo, “En este sitio” (uso por tarjeta o grid, calculado sobre borradores), “Añadir a una página” (agrega una `ProductCardBlock` con revisión), enlace “Editar en Catálogo”, estados vacío/error/sin permiso. No hay maestro de productos paralelo. |
| Formularios | Terminado | Estado C-4 en español (publicable, propietario sin resolver, ambiguo, deshabilitado, dependencia), dónde se usa (páginas y entradas) y resolución explícita de propiedad (`POST …/forms/:id/scope`). El ambiguo exige confirmación y avisa de los permisos de Website y Growth. Nada se oculta ni se elimina. |
| Pagos | Conectado por sitio | Las claves de Stripe se guardan en el sitio elegido. Sin checkout nuevo ni certificación de cobros. |

## Rutas y permisos

`/sites/:siteId/catalog|advanced|payments|blog/:postId` no están en `routePermissions` del manifest (backend). El resolver hereda la política de la entrada padre: catalog ← `/sites/:siteId`; advanced y payments ← `…/settings`; entrada ← `…/blog`. Cada operación la vuelve a autorizar el backend o Catálogo.

## Evidencia

| Prueba | Resultado |
|---|---|
| Laboratorio real desechable (Compose propio, PostgreSQL, Auth, Storage, API completa, Vite con providers reales, Chromium) `node scripts/test-website-sections-browser.mjs` | **11/11**, sin errores de página: dos sitios; las 7 secciones abren sin aviso de sitio predeterminado ni “Acceso restringido”; entrada de blog solo en B y seleccionable al publicar; tema y menú de B ausentes en A; plantillas explícitamente no disponibles fuera del predeterminado; analítica/Turnstile y Stripe guardados solo en B y sin pestaña de fuente; formulario histórico bloqueado y luego resuelto; Catálogo publicar/quitar sin alterar POS, añadir a página, uso por sitio y advertencia al quitar; lector sin permiso de Catálogo; tema oscuro y 390 px sin desplazamiento horizontal. |
| Regresión integrada `node scripts/test-website-functional-browser.mjs` (afectada por Formularios, hoja de publicación y resolver) | **16/16**. Un asert se actualizó al nuevo marcado (`data-publishability`). |
| `node --test` focalizadas | 15 casos en 4 archivos: utilidades de Catálogo (uso, añadir bloque sin mutar), copy de publicabilidad, rutas heredadas, y las anteriores. |
| ESLint, `pnpm --filter @runly/desktop build:web` | Sin hallazgos / correcto. |

No se repitieron S1–S4 ni las suites de backend: sus dependencias no cambiaron.

## Bloqueos reales para Codex

1. **Manifest:** declarar en `routePermissions` `/sites/:siteId/catalog`, `/advanced`, `/payments` y `/blog/:postId` para que el filtro del servidor sea la fuente (hoy el frontend hereda del padre).
2. **Catálogo por sitio:** `catalog_product.published` es de la empresa: no existe visibilidad web por sitio. Hace falta un contrato (endpoint y DTO de vínculo producto-sitio, o confirmar que la visibilidad es global) y un `usedBy` por producto análogo a C-4; hoy el uso se calcula en el cliente sobre los borradores (primeras 50 páginas).
3. **Plantillas por sitio:** aplicar una plantilla escribe en el sitio predeterminado por rutas históricas no atómicas ni revisionadas. Se ofrece solo ahí; para otros sitios falta un comando atómico “aplicar plantilla” con revisión e idempotencia.
4. **Retirar entradas publicadas:** el preflight solo tiene `unpublishPageIds`; eliminar una entrada en un sitio con versiones responde 409 `publication_requires_explicit_action`. Falta `unpublishPostIds` o un comando explícito.
5. **Analítica, antispam y Stripe:** son campos vivos del sitio, no parte del borrador de identidad ni del release; cambian sin pasar por Publicar. SMTP es de la empresa. Falta decidir si deben versionarse.
6. **Propietario ambiguo:** la interfaz está implementada y su copy probada, pero no se ejerció en el laboratorio (requiere una propiedad Growth con el mismo identificador histórico). El flujo “sin resolver” sí se verificó de extremo a extremo.

## Lo que aún no puede declararse listo

Dominios propios, Calendar y exportación o borrado de respuestas (sin cambios). Edición de plantillas fuera del sitio predeterminado. Visibilidad por sitio en Catálogo. Detección de cambios sin guardar del builder 0.2.4 (sin cambios, no se inventa). Cobros y checkout. Prueba en dispositivo táctil y con lector de pantalla. Website completo requiere la validación integral posterior.
