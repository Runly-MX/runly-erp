import { restauranteTemplate, restauranteSitePages } from '../runlyBlocks/templates/restauranteTemplate.js'
import { spaTemplate,         spaSitePages }         from '../runlyBlocks/templates/spaTemplate.js'
import { tiendaTemplate,      tiendaSitePages }      from '../runlyBlocks/templates/tiendaTemplate.js'
import { agenciaTemplate,     agenciaSitePages }     from '../runlyBlocks/templates/agenciaTemplate.js'
import { negocioTemplate,     negocioSitePages }     from '../runlyBlocks/templates/negocioTemplate.js'
import { habitiaTemplate, habtiaSitePages } from '../runlyBlocks/templates/habitiaTemplate.js'
import { finoraTemplate,      finoraSitePages }      from '../runlyBlocks/templates/finoraTemplate.js'
import { mayaTemplate,        mayaSitePages }        from '../runlyBlocks/templates/mayaTemplate.js'

import { TEMPLATE_THEMES } from './templateThemes.js'
import { polishPage } from './templatePolish.js'

const CATEGORY_COLORS = {
  restaurante: '#92400e',
  belleza:     '#9d174d',
  ecommerce:   '#065f46',
  agencia:     '#1e3a8a',
  negocio:     '#4c1d95',
  hogar:       '#7C5A3E',
  finanzas:    '#166534',
  portafolio:  '#1D4ED8',
}

function buildPageData(templateId, pageId, label, routePath, description, { rootIds, blocks }) {
  return {
    schemaVersion: 1,
    id:         `page_${templateId}_${pageId}`,
    slug:       routePath,
    title:      label,
    visibility: 'public',
    regions: {
      main: { id: `region_${templateId}_${pageId}`, children: rootIds },
    },
    blocks,
    seo: { title: label, description, canonical: null, ogImageAssetId: null },
    updatedAt: new Date().toISOString(),
  }
}

function wrapTemplate(tpl, sitePages = [], themeTokens = null) {
  const homeData = tpl.build()
  return {
    id:          tpl.id,
    label:       tpl.label,
    description: tpl.description,
    color:       CATEGORY_COLORS[tpl.category] || '#334155',
    themeTokens: TEMPLATE_THEMES[tpl.id] ?? themeTokens,
    pages: [
      {
        id:        'home',
        label:     'Inicio',
        routePath: '/',
        required:  true,
        page:      buildPageData(tpl.id, 'home', 'Inicio', '/', tpl.description, polishPage(tpl.id, 'home', homeData)),
      },
      ...sitePages.map((p) => ({
        id:        p.id,
        label:     p.label,
        routePath: p.routePath,
        required:  p.required ?? false,
        page:      buildPageData(tpl.id, p.id, p.label, p.routePath, p.description ?? '', polishPage(tpl.id, p.id, p.build())),
      })),
    ],
  }
}

export const allTemplates = [
  wrapTemplate(restauranteTemplate, restauranteSitePages),
  wrapTemplate(spaTemplate,        spaSitePages),
  wrapTemplate(tiendaTemplate,     tiendaSitePages),
  wrapTemplate(agenciaTemplate,    agenciaSitePages),
  wrapTemplate(negocioTemplate,    negocioSitePages),
  wrapTemplate(habitiaTemplate,    habtiaSitePages),
  wrapTemplate(finoraTemplate,     finoraSitePages),
  wrapTemplate(mayaTemplate,       mayaSitePages),
]
