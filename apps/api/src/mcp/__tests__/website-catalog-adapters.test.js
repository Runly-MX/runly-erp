import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebsiteAdapter } from '../adapters/website.js';
import { createCatalogAdapter } from '../adapters/catalog.js';

const companyId = '01900000-0000-7000-8000-000000000001', siteId = '01900000-0000-7000-8000-000000000002', homeId = '01900000-0000-7000-8000-000000000003';
const actor = (perms = []) => ({ companyId, actorProfileId: '01900000-0000-7000-8000-000000000009', can: key => perms.includes(key) });
const site = { id: siteId, companyId, name: 'Taquería', siteType: 'website', sourceType: 'builder', enabled: true };

function websitePrisma(pages = []) {
  return {
    websiteSite: { findFirst: async () => site },
    websitePage: {
      findFirst: async ({ where }) => pages.find(p => (where.id ? p.id === where.id : p.routePath === where.routePath) && p.companyId === where.companyId) ?? null,
      findMany: async () => [],
    },
  };
}

test('website.pages.draft: valida secciones, distingue nuevas/existentes y exige permiso de creación', async () => {
  const pages = [{ id: homeId, companyId, siteId, routePath: '/', title: 'Inicio', enabled: true, draftBuilderData: {} }];
  const adapter = createWebsiteAdapter({ prisma: websitePrisma(pages) });
  const draft = adapter.actions.find(action => action.key === 'website.pages.draft');
  const input = draft.inputSchema.parse({ pages: [
    { routePath: '/', title: 'Inicio', sections: [{ type: 'HeroBlock', props: { title: 'Tacos al pastor' } }] },
    { routePath: '/menu', title: 'Menú', sections: [{ type: 'MenuGridBlock' }] },
  ] });
  await assert.rejects(draft.prepare(input, actor()), error => error.code === 'permission_denied');
  const prepared = await draft.prepare(input, actor(['website.pages.create']));
  assert.equal(prepared.input.pages[0].pageId, homeId);
  assert.equal(prepared.input.pages[1].pageId, null);
  assert.equal(prepared.input.pages[1].slug, 'menu');
  assert.equal(prepared.input.pages[0].document.blocks.b1.props.title, 'Tacos al pastor');
  assert.deepEqual(prepared, await draft.prepare(input, actor(['website.pages.create'])), 'determinista para la huella de la propuesta');
  const bad = draft.inputSchema.parse({ pages: [{ routePath: '/x', title: 'X', sections: [{ type: 'HeroBlock', props: { ctaHref: 'javascript:alert(1)' } }] }] });
  await assert.rejects(draft.prepare(bad, actor(['website.pages.create'])), error => error.code === 'invalid_page' && /ctaHref/.test(error.message));
  assert.equal(draft.inputSchema.safeParse({ pages: [{ routePath: 'menu', title: 'X', sections: [{ type: 'HeroBlock' }] }] }).success, false);
});

test('website.pages.publish: rechaza páginas sin borrador', async () => {
  const pages = [{ id: homeId, companyId, siteId, routePath: '/', title: 'Inicio', enabled: true, draftBuilderData: {} }];
  const publish = createWebsiteAdapter({ prisma: websitePrisma(pages) }).actions.find(action => action.key === 'website.pages.publish');
  await assert.rejects(publish.prepare({ pageIds: [homeId] }, actor()), error => error.code === 'invalid_request');
});

test('catálogo: las imágenes deben ser públicas de la empresa', async () => {
  let where = null;
  const prisma = { fileAsset: { findMany: async args => { where = args.where; return []; } }, $queryRaw: async () => [] };
  const create = createCatalogAdapter({ prisma }).actions.find(action => action.key === 'catalog.product.create');
  const input = create.inputSchema.parse({ data: { name: 'Taco', slug: 'taco', price: 25, cover_asset_id: homeId } });
  await assert.rejects(create.prepare(input, actor()), error => error.code === 'invalid_request');
  assert.equal(where.visibility, 'PUBLIC');
  assert.equal(where.entityId, companyId);
});
