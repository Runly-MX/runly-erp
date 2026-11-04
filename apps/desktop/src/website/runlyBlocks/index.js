// --- Bloques existentes ---
import { ContactFormBlock }  from './contactFormBlock.jsx'
import { BlogIndexBlock }    from './blogIndexBlock.jsx'
import { ProductsGridBlock } from './productsGridBlock.jsx'
import { ProductCardBlock }  from './productCardBlock.jsx'
import { CartBlock }         from './cartBlock.jsx'
import { BookingFormBlock }  from './bookingFormBlock.jsx'

// --- Bloques universales ---
import { ServicesGridBlock }    from './servicesGridBlock.jsx'
import { TestimonialsBlock }    from './testimonialsBlock.jsx'
import { StatsBlock }           from './statsBlock.jsx'
import { GalleryBlock }         from './galleryBlock.jsx'
import { CtaBannerBlock }       from './ctaBannerBlock.jsx'
import { FeaturesSectionBlock } from './featuresSectionBlock.jsx'
import { TeamGridBlock }        from './teamGridBlock.jsx'

// --- Bloques premium ---
import { SplitFeatureBlock } from './splitFeatureBlock.jsx'
import { MarqueeBlock }      from './marqueeBlock.jsx'
import { BentoGridBlock }    from './bentoGridBlock.jsx'
import { QuoteBlock }        from './quoteBlock.jsx'

// --- Bloques específicos por giro ---
import { MenuGridBlock } from './menuGridBlock.jsx'
import { ShowcaseHeroBlock } from './showcaseHeroBlock.jsx'
import { ProjectCardsBlock } from './projectCardsBlock.jsx'
import { LogoCloudBlock }    from './logoCloudBlock.jsx'
import { TopBarBlock }       from './topBarBlock.jsx'
import { ParallaxSectionBlock } from './parallaxSectionBlock.jsx'
import { LandscapeHeroBlock } from './landscapeHeroBlock.jsx'
import { ChapterBlock } from './chapterBlock.jsx'

// --- Templates ---
import {
  restauranteTemplate,
  spaTemplate,
  tiendaTemplate,
  agenciaTemplate,
  negocioTemplate,
  habitiaTemplate,
  allRunlyTemplates,
} from './templates/index.js'

export {
  restauranteTemplate,
  spaTemplate,
  tiendaTemplate,
  agenciaTemplate,
  negocioTemplate,
  habitiaTemplate,
  allRunlyTemplates,
}

// ─── Grupos por categoría ────────────────────────────────────────────────────

export const universalRunlyBlocks = [
  ContactFormBlock,
  BlogIndexBlock,
  ServicesGridBlock,
  TestimonialsBlock,
  StatsBlock,
  GalleryBlock,
  CtaBannerBlock,
  FeaturesSectionBlock,
  TeamGridBlock,
  SplitFeatureBlock,
  MarqueeBlock,
  BentoGridBlock,
  QuoteBlock,
  ShowcaseHeroBlock,
  ProjectCardsBlock,
  LogoCloudBlock,
  TopBarBlock,
  ParallaxSectionBlock,
  LandscapeHeroBlock,
  ChapterBlock,
]

export const ecommerceRunlyBlocks = [
  ProductsGridBlock,
  ProductCardBlock,
  CartBlock,
]

export const bookingsRunlyBlocks = [
  BookingFormBlock,
]

export const restaurantRunlyBlocks = [
  MenuGridBlock,
]

// ─── Re-exports individuales para uso directo ────────────────────────────────

export {
  ContactFormBlock,
  BlogIndexBlock,
  ProductsGridBlock,
  ProductCardBlock,
  CartBlock,
  BookingFormBlock,
  ServicesGridBlock,
  TestimonialsBlock,
  StatsBlock,
  GalleryBlock,
  CtaBannerBlock,
  FeaturesSectionBlock,
  TeamGridBlock,
  MenuGridBlock,
  SplitFeatureBlock,
  MarqueeBlock,
  BentoGridBlock,
  QuoteBlock,
  ShowcaseHeroBlock,
  ProjectCardsBlock,
  LogoCloudBlock,
  TopBarBlock,
  ParallaxSectionBlock,
}

// ─── Builders por tipo de sitio ──────────────────────────────────────────────

export function buildRunlyBlocks(siteType) {
  const blocks = [...universalRunlyBlocks]
  if (siteType === 'ecommerce')  blocks.push(...ecommerceRunlyBlocks)
  if (siteType === 'bookings')   blocks.push(...bookingsRunlyBlocks)
  if (siteType === 'restaurant') blocks.push(...restaurantRunlyBlocks)
  return blocks
}

export function buildRunlyTemplates(siteType) {
  const base = [agenciaTemplate, negocioTemplate]
  if (siteType === 'ecommerce')  return [...base, tiendaTemplate, habitiaTemplate]
  if (siteType === 'bookings')   return [...base, spaTemplate, restauranteTemplate]
  if (siteType === 'restaurant') return [restauranteTemplate, ...base]
  return [restauranteTemplate, spaTemplate, agenciaTemplate, negocioTemplate, habitiaTemplate]
}
