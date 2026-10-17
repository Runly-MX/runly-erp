import { z } from 'zod';
import { createWebsiteService } from '../../routes/website/website-service.js';
import { BLOCK_CATALOG, blocksForSite, documentToSections, sectionsToDocument } from '../../routes/website/page-document.js';
import { insist } from '../config.js';
import { pageInput } from '../contracts.js';

const PUBLIC_BUCKET = 'runly-website';
const SITE_TYPES = ['website', 'ecommerce', 'blog', 'landing'];
const FONTS = ['Inter, sans-serif', 'Roboto, sans-serif', 'Poppins, sans-serif', 'Open Sans, sans-serif', 'Lato, sans-serif', 'Montserrat, sans-serif', 'Merriweather, serif', 'Georgia, serif', 'Playfair Display, serif', 'Fira Code, monospace'];
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const routePath = z.string().max(200).regex(/^\/([a-z0-9-]+(\/[a-z0-9-]+)*)?$/, 'Ruta tipo /, /menu o /tienda/ofertas');
const section = z.strictObject({ type: z.string().min(1).max(60), props: z.record(z.string(), z.json()).optional(), children: z.record(z.string(), z.array(z.json()).max(60)).optional() });
const editorLink = id => `/app/m/runly.website/pages/${id}/editor`;

export const WEBSITE_DESIGN_GUIDE = [
  'Flujo: website_overview -> website_block_catalog (con types para ver props y defaults) -> website.site.setup -> website.pages.draft -> revisar en el editor -> website.pages.publish.',
  'Cada página es una lista vertical de secciones. Repite el mismo NavbarBlock al inicio y el mismo FooterBlock al final de todas las páginas; sus enlaces apuntan a las rutas reales del sitio.',
  'La página de inicio usa la ruta "/". Abre con un HeroBlock claro (qué ofrece el negocio y una acción), luego 4 a 8 secciones que alternen fondos y terminen en una llamada a la acción.',
  'Escribe textos reales en español con los datos de website_overview y del catálogo; nada de lorem ipsum ni datos inventados como precios o teléfonos.',
  'Los campos textarea con listas siguen el formato de su defaultProps (por ejemplo "Etiqueta | /ruta" por línea y "---" entre columnas). Respeta ese formato.',
  'Imágenes: usa URLs de website_media o https públicas. Para subir una imagen nueva usa runly_files_import_prepare con target { type: "website.site", id: <siteId> }.',
  'Tienda: ProductsGridBlock y ProductCardBlock muestran productos publicados del catálogo; créalos con runly_catalog_prepare. CartBlock agrega el carrito.',
  'Contacto y reservas: ContactFormBlock y BookingFormBlock guardan las solicitudes en Runly. No inventes formularios con texto.',
  'Usa los colores del tema (tokens primary, accent, muted, bg, fg) en fondos y variantes en vez de colores sueltos. Máximo 12 páginas por propuesta.',
];

function compactField(field) {
  return field.options ? `${field.type}:${field.options.join('|')}` : field.type;
}

export function createWebsiteAdapter({ prisma, supabaseAdmin = null }) {
  const svc = createWebsiteService({ prisma });
  async function site(a) {
    const row = await svc.getSite({ companyId: a.companyId });
    insist(row, 'not_found', 'La empresa aún no tiene sitio. Créalo con website.site.setup.', 404);
    return row;
  }
  async function page(a, pageId, siteId) {
    const row = await prisma.websitePage.findFirst({ where: { id: pageId, companyId: a.companyId, siteId, enabled: true } });
    insist(row, 'not_found', 'Página no disponible.', 404);
    return row;
  }
  const publicUrl = file => supabaseAdmin?.storage?.from(file.bucket).getPublicUrl(file.objectKey)?.data?.publicUrl ?? null;

  const queries = [
    { name: 'website_overview', permission: 'website.site.read', inputSchema: z.strictObject({}), definition: { description: 'Sitio de la empresa, tema, páginas (rutas y estado) y datos del negocio. Punto de partida para crear o editar el sitio.' },
      async run(_input, a) {
        const [current, company] = await Promise.all([svc.getSite({ companyId: a.companyId }), prisma.company.findUnique({ where: { id: a.companyId }, select: { name: true } })]);
        const [theme, pages] = current ? await Promise.all([svc.getActiveTheme({ companyId: a.companyId }), svc.listPages({ companyId: a.companyId, siteId: current.id, pageSize: 100 })]) : [null, { data: [] }];
        return { company: { name: company?.name ?? '' }, catalogAvailable: a.can('catalog.products.read'),
          site: current && { id: current.id, name: current.name, siteType: current.siteType, sourceType: current.sourceType, domain: current.domain, status: current.status },
          theme: theme && { colors: theme.tokens?.color ?? {}, typography: theme.typography ?? {} },
          pages: pages.data.map(row => ({ id: row.id, title: row.title, routePath: row.routePath, status: row.status, link: editorLink(row.id) })),
          guide: WEBSITE_DESIGN_GUIDE };
      } },
    { name: 'website_block_catalog', permission: 'website.pages.read', inputSchema: z.strictObject({ siteType: z.enum([...SITE_TYPES, 'bookings', 'restaurant']).optional(), types: z.array(z.string().max(60)).max(20).optional() }),
      definition: { description: 'Bloques disponibles para las páginas. Sin types: lista compacta (campo:tipo/opciones). Con types: detalle con defaultProps para escribir esos bloques. Incluye el formato de sections y la guía de diseño.' },
      run(input) {
        const blocks = input.types?.length ? BLOCK_CATALOG.blocks.filter(block => input.types.includes(block.type)) : blocksForSite(input.siteType);
        return { format: 'sections: [{ type, props?, children?: { <slot>: [sections] } }]. Solo los bloques con slots admiten children. Props omitidas toman su valor por defecto.',
          blocks: blocks.map(block => ({ type: block.type, label: block.label, group: block.group, slots: block.slots, fields: Object.fromEntries(Object.entries(block.fields).map(([key, field]) => [key, compactField(field)])), ...(input.types?.length ? { defaultProps: block.defaultProps } : {}) })),
          guide: WEBSITE_DESIGN_GUIDE };
      } },
    { name: 'website_page_detail', permission: 'website.pages.read', inputSchema: z.strictObject({ pageId: z.uuid() }), definition: { description: 'Página con su borrador en formato sections, para editarla y reenviarla completa con website.pages.draft.' },
      async run(input, a) {
        const row = await page(a, input.pageId, (await site(a)).id);
        return { id: row.id, title: row.title, routePath: row.routePath, status: row.status, seo: row.seo, sections: documentToSections(row.draftBuilderData), link: editorLink(row.id) };
      } },
    { name: 'website_media', permission: 'website.pages.read', inputSchema: z.strictObject({ ...pageInput, search: z.string().max(120).optional() }), definition: { description: 'Imágenes públicas de la empresa con URL permanente, aptas para páginas y productos.' },
      async run(input, a) {
        const where = { entityId: a.companyId, enabled: true, visibility: 'PUBLIC', bucket: PUBLIC_BUCKET, mimeType: { startsWith: 'image/' }, ...(input.search ? { originalName: { contains: input.search, mode: 'insensitive' } } : {}) };
        const rows = await prisma.fileAsset.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (input.page - 1) * input.limit, take: input.limit, select: { id: true, originalName: true, mimeType: true, bucket: true, objectKey: true } });
        return { items: rows.map(file => ({ fileId: file.id, name: file.originalName, mimeType: file.mimeType, url: publicUrl(file) })), page: input.page, limit: input.limit, hasMore: rows.length === input.limit };
      } },
  ];

  const actions = [
    { key: 'website.site.setup', permission: 'website.site.update', operation: 'update', label: 'Configurar sitio y tema',
      inputSchema: z.strictObject({ name: z.string().trim().min(1).max(255).optional(), siteType: z.enum(SITE_TYPES).optional(), useBuilder: z.literal(true).optional(),
        theme: z.strictObject({ colors: z.strictObject({ primary: hex, primaryFg: hex, bg: hex, fg: hex, muted: hex, accent: hex }).partial().optional(), headingFont: z.enum(FONTS).optional(), bodyFont: z.enum(FONTS).optional(), headingWeight: z.enum(['400', '500', '600', '700', '800']).optional(), baseFontSize: z.enum(['14px', '15px', '16px', '17px', '18px']).optional() }).optional() }),
      async prepare(input, a) {
        const current = await svc.getSite({ companyId: a.companyId });
        insist(current || input.name, 'invalid_request', 'Indica name para crear el sitio.');
        const fields = [{ label: 'Sitio', value: `${input.name ?? current.name} (${input.siteType ?? current?.siteType ?? 'website'})`, ...(current ? { before: `${current.name} (${current.siteType})` } : {}) }];
        if (input.theme) fields.push({ label: 'Tema', value: JSON.stringify(input.theme) });
        if (input.useBuilder && current?.sourceType !== 'builder') fields.push({ label: 'Origen del sitio público', value: 'Páginas del builder', before: current?.sourceType ?? 'builder' });
        return { input, targetId: current?.id ?? null, preview: { title: current ? 'Actualizar sitio' : 'Crear sitio', fields } };
      },
      async execute(input, a) {
        let current = await svc.getSite({ companyId: a.companyId });
        const data = { ...(input.name ? { name: input.name } : {}), ...(input.siteType ? { siteType: input.siteType } : {}) };
        current = current ? (Object.keys(data).length ? await svc.updateSite({ companyId: a.companyId, siteId: current.id, data, actorId: a.actorProfileId }) : current) : await svc.createSite({ companyId: a.companyId, data, actorId: a.actorProfileId });
        if (input.useBuilder && current.sourceType !== 'builder') await prisma.websiteSite.update({ where: { id: current.id }, data: { sourceType: 'builder' } });
        if (input.theme) {
          const existing = await prisma.websiteTheme.findFirst({ where: { companyId: a.companyId, siteId: current.id, enabled: true }, select: { tokens: true, typography: true } });
          const { colors, ...typography } = input.theme;
          await svc.upsertTheme({ companyId: a.companyId, siteId: current.id, tokens: colors ? { ...(existing?.tokens ?? {}), color: { ...(existing?.tokens?.color ?? {}), ...colors } } : undefined, typography: Object.keys(typography).length ? { ...(existing?.typography ?? {}), ...typography } : undefined });
        }
        return { siteId: current.id, name: current.name, link: '/app/m/runly.website' };
      } },
    { key: 'website.pages.draft', permission: 'website.pages.update', operation: 'update', label: 'Guardar borradores de páginas',
      inputSchema: z.strictObject({ pages: z.array(z.strictObject({ pageId: z.uuid().optional(), routePath: routePath.optional(), title: z.string().trim().min(1).max(255), seo: z.strictObject({ title: z.string().max(160).optional(), description: z.string().max(320).optional() }).optional(), sections: z.array(section).min(1).max(60) })).min(1).max(12) }),
      async prepare(input, a) {
        const current = await site(a), resolved = [], fields = [];
        for (const [index, item] of input.pages.entries()) {
          insist(item.pageId || item.routePath, 'invalid_request', `pages[${index}]: indica pageId o routePath.`);
          const existing = item.pageId ? await page(a, item.pageId, current.id) : await prisma.websitePage.findFirst({ where: { companyId: a.companyId, siteId: current.id, routePath: item.routePath, enabled: true } });
          insist(existing || a.can('website.pages.create'), 'permission_denied', 'Se requiere permiso para crear páginas.', 403);
          const path = existing?.routePath ?? item.routePath, slug = path === '/' ? 'inicio' : path.slice(1).replace(/\//g, '-');
          insist(!resolved.some(other => other.routePath === path), 'invalid_request', `Ruta repetida en la propuesta: ${path}`);
          const document = sectionsToDocument({ id: existing?.id ?? slug, slug, title: item.title, sections: item.sections });
          resolved.push({ pageId: existing?.id ?? null, routePath: path, slug, title: item.title, seo: item.seo ?? null, document });
          fields.push({ label: `${path} ${existing ? '(existente)' : '(nueva)'}`, value: `${item.title}: ${Object.keys(document.blocks).length} bloques · ${item.sections.map(s => s.type).join(', ')}` });
        }
        return { input: { pages: resolved }, targetId: current.id, preview: { title: 'Guardar borradores (no se publica nada)', fields } };
      },
      async execute(input, a) {
        const current = await site(a), saved = [];
        for (const item of input.pages) {
          let row = item.pageId ? await page(a, item.pageId, current.id) : await svc.createPage({ companyId: a.companyId, siteId: current.id, data: { title: item.title, slug: item.slug, routePath: item.routePath }, actorId: a.actorProfileId });
          if (item.pageId && row.title !== item.title) row = await svc.updatePage({ companyId: a.companyId, pageId: row.id, data: { title: item.title }, actorId: a.actorProfileId });
          const seo = item.seo ? { ...(row.seo ?? {}), ...item.seo } : undefined;
          await svc.saveDraft({ companyId: a.companyId, pageId: row.id, builderData: JSON.stringify({ ...item.document, id: row.id }), seo, actorId: a.actorProfileId });
          saved.push({ id: row.id, title: item.title, routePath: row.routePath, status: row.status, link: editorLink(row.id) });
        }
        return { siteId: current.id, pages: saved };
      } },
    { key: 'website.pages.publish', permission: 'website.pages.publish', operation: 'update', label: 'Publicar páginas',
      inputSchema: z.strictObject({ pageIds: z.array(z.uuid()).min(1).max(30) }),
      async prepare(input, a) {
        const current = await site(a), pageIds = [...new Set(input.pageIds)].sort(), fields = [];
        for (const id of pageIds) {
          const row = await page(a, id, current.id);
          insist(documentToSections(row.draftBuilderData).length, 'invalid_request', `La página ${row.routePath} no tiene contenido en borrador.`);
          fields.push({ label: row.routePath, value: `${row.title} — visible públicamente`, before: row.status });
        }
        return { input: { pageIds }, targetId: current.id, preview: { title: 'Publicar páginas en el sitio público', fields } };
      },
      async execute(input, a) {
        const current = await site(a), published = [];
        for (const id of input.pageIds) {
          const row = await svc.publishPage({ companyId: a.companyId, pageId: id, actorId: a.actorProfileId });
          published.push({ id: row.id, routePath: row.routePath, publishedAt: row.publishedAt });
        }
        return { siteId: current.id, published, domain: current.domain };
      } },
  ];

  return { moduleKey: 'runly.website', label: 'Sitio web', queries, actions,
    // Drafts are private; publishing (or switching the public source) exposes content.
    async revision(definition, prepared, a) {
      if (definition.key === 'website.site.setup') return svc.getSite({ companyId: a.companyId });
      const ids = definition.key === 'website.pages.publish' ? prepared.input.pageIds : prepared.input.pages.map(item => item.pageId).filter(Boolean);
      const rows = await prisma.websitePage.findMany({ where: { id: { in: ids }, companyId: a.companyId }, select: { id: true, updatedAt: true, status: true }, orderBy: { id: 'asc' } });
      return rows;
    },
    sensitive: (definition, input) => definition.key === 'website.pages.publish' || input?.useBuilder === true,
    effects: ['Crear/editar el sitio, su tema y borradores de páginas (no visibles al público). Publicar hace visibles las páginas en el sitio público de la empresa.'],
  };
}
