# Website + Catálogo por MCP con la IA del usuario (BYO-AI)

Status: approved (autonomous roadmap decision, 2026-10-17)

## Problem

Runly no tiene una API de IA de pago para generar sitios. Los usuarios ya pagan
ChatGPT o Claude, y ambos se conectan a servidores MCP. El MCP de Runly expone
13 dominios, pero no `runly.website` ni `runly.catalog`, así que un asistente
externo no puede armar un sitio ni una tienda en línea. Además, el selector de
imágenes del editor de páginas lista cualquier archivo de la empresa con URLs
firmadas que caducan: las imágenes privadas pueden terminar en una página
pública y dejar de verse al expirar la firma.

## Goals

1. El asistente del usuario (ChatGPT/Claude con su suscripción) puede crear un
   sitio completo: sitio, tema, páginas en borrador hechas con los bloques del
   builder, publicación aprobada.
2. Puede consultar y crear productos/categorías del catálogo para una tienda.
3. Las imágenes del sitio y de los productos viven en `runly.files` como
   archivos PUBLIC (bucket `runly-website`, URL estable).
4. Todo lo generado queda editable en el builder visual existente.
5. Cero costo de tokens para Runly.

## Non-goals

- Generación con IA dentro de Runly (MirAI no participa).
- Sitios en código libre (ZIP `dist`) por MCP; queda para una fase posterior.
- Bloque "Sección libre HTML", vista previa embebida en el chat (Apps SDK /
  MCP Apps), botón "copiar prompt / importar JSON". Fases posteriores.
- Pagos (Stripe) y LMS: ideas registradas para módulos futuros.

## Design

### Catálogo de bloques en el servidor

Los bloques son JSX en `apps/desktop`. `scripts/generate-website-block-catalog.mjs`
los carga con Vite SSR y escribe `apps/api/src/routes/website/block-catalog.json`
(tipo, etiqueta, categoría, grupo de sitio, `defaultProps`, `fields`, slots).
Un test compara los tipos del JSON con los `type:` declarados en `runlyBlocks/*.jsx`
para detectar un catálogo desactualizado.

### Documento de página simplificado

El modelo no escribe el formato interno `{ regions, blocks }` con IDs. Envía:

```json
{ "sections": [ { "type": "HeroBlock", "props": { "title": "..." },
                  "children": { "children": [ { "type": "HeadingBlock", "props": {} } ] } } ] }
```

`page-document.js` valida contra el catálogo (tipo conocido, props declaradas,
valores de `select`, booleanos, enlaces seguros, imágenes https, fondos,
slots válidos, máx. 300 bloques y profundidad 6), completa `defaultProps`,
genera IDs y serializa el documento del builder (`schemaVersion: 1`) igual que
el editor. También convierte un documento existente de vuelta a `sections`
para editar páginas actuales.

### Adaptador MCP `runly.website`

Queries: `website_overview` (sitio, tema, páginas, empresa, si hay catálogo),
`website_block_catalog` (bloques + guía de diseño + formato), `website_page_detail`
(secciones del borrador), `website_media` (imágenes PUBLIC con URL estable).

Acciones (prepare → aprobación web → commit):
- `website.site.setup` (`website.site.update`): crea o actualiza el sitio
  (nombre, tipo) y el tema (colores, tipografías).
- `website.pages.draft` (`website.pages.update`, y `website.pages.create` si crea):
  hasta 12 páginas por propuesta; crea las que no existen y guarda borradores.
  No sensible: nada se vuelve público.
- `website.pages.publish` (`website.pages.publish`): publica páginas y define
  la página de inicio. Sensible: expone contenido públicamente.

### Adaptador MCP `runly.catalog`

Queries: `catalog_products_page`, `catalog_product_detail`, `catalog_categories`.
Acciones: `catalog.product.create`, `catalog.product.update`,
`catalog.category.create`. La imagen de portada debe ser un archivo de imagen
PUBLIC de la empresa. Sensible cuando el producto queda publicado.

### Archivos

- Nuevos destinos de `runly_files_import_prepare`: `website.site` y
  `catalog.product`, ambos `native` y PUBLIC. El de producto asigna la portada
  si no hay una y agrega la imagen a la galería.
- `GET /files` acepta `visibility`. El selector de imágenes del editor lista
  solo imágenes PUBLIC.

### Scopes y UI

Nuevos scopes `website:read|write`, `catalog:read|write` (total < 500 chars).
Etiquetas de dominio en la pantalla de conexión MCP.

## Security

- Mismo runtime: revalidación de empresa, módulo, scope, permiso y propuesta.
- Ninguna escritura publica algo sin la aprobación sensible explícita.
- Validación estricta del documento: sin tipos ni props arbitrarios, enlaces
  limitados a `https:`, `http:`, `mailto:`, `tel:`, rutas relativas y anclas;
  HTML de texto enriquecido sin `<script>`, manejadores `on*` ni `javascript:`.
- Solo archivos PUBLIC de la empresa como imágenes de producto.

## Verification

Unit tests de `page-document.js`, del catálogo y de los adaptadores con prisma
simulado; contrato del registro (conteo de herramientas, scopes, permisos);
`node --test apps/api/src/mcp/__tests__/`; `pnpm lint`; arranque real de la API
y `tools/list` del MCP.
