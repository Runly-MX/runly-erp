// --- Bloques existentes ---
import { ContactFormBlock }  from './contactFormBlock.jsx'
import { BlogIndexBlock }    from './blogIndexBlock.jsx'
import { ProductsGridBlock } from './productsGridBlock.jsx'
import { ProductCardBlock }  from './productCardBlock.jsx'
import { CartBlock }         from './cartBlock.jsx'
import { BookingFormBlock }  from './bookingFormBlock.jsx'
import { AccountPortalBlock } from './accountPortalBlock.jsx'

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
import { SiteFooterBlock } from './siteFooterBlock.jsx'
import { FinHeroBlock } from './finHeroBlock.jsx'
import { FinClosingBlock } from './finClosingBlock.jsx'
import { FinCalculatorBlock } from './finCalculatorBlock.jsx'
import { FinLoanCardsBlock, FinStepsBlock } from './finLoanCardsBlock.jsx'
import { LandscapeHeroBlock } from './landscapeHeroBlock.jsx'
import { ChapterBlock } from './chapterBlock.jsx'
import { ProductDetailBlock, CartPageBlock } from './storeShopBlocks.jsx'
import { StoreNavbarBlock } from './storeNavbarBlock.jsx'
import { StoreHeroBlock, CollectionTilesBlock, TrustStripBlock } from './storeEditorialBlocks.jsx'
import { mayaBlocks, MayaPortraitBlock, MayaTagBlock, MayaTickerBlock, MayaWorkBlock, MayaNotesBlock, MayaPageHeroBlock, MayaClosingBlock } from './mayaBlocks.jsx'
import { MayaPlansBlock } from './mayaPlansBlock.jsx'
import { agencyBlocks, AgencyHeroBlock, AgencyMarqueeBlock, AgencyWorkBlock, AgencyServicesBlock, AgencyFactsBlock, AgencyVoicesBlock, AgencyTeamBlock, AgencyClosingBlock } from './agencyBlocks.jsx'
import { bizBlocks, BizHeroBlock, BizPillarsBlock, BizKpiBandBlock, BizProcessBlock, BizCasesBlock, BizEngagementBlock, BizTrustBlock, BizClosingBlock } from './bizBlocks.jsx'
import { RestoHeroBlock, RestoMenuBlock, RestoHoursBlock } from './restoBlocks.jsx'
import { SpaHeroBlock, SpaRitualsBlock, SpaClosingBlock } from './spaBlocks.jsx'
import { habitiaBlocks, HabitiaHeroBlock, HabitiaRoomsBlock, HabitiaPiecesBlock, HabitiaMaterialsBlock, HabitiaQuoteBlock, HabitiaLeafletBlock, HabitiaStoryBlock, HabitiaFiguresBlock, HabitiaPageHeroBlock, HabitiaClosingBlock } from './habitiaBlocks.jsx'
import { devfolioBlocks } from './devfolioRegistry.js'
import { mercadoBlocks } from './mercadoRegistry.js'
import { impulsaBlocks } from './impulsaRegistry.js'
import { cristalBlocks } from './cristalRegistry.js'

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
  AccountPortalBlock,
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
  SiteFooterBlock,
  FinHeroBlock,
  FinCalculatorBlock,
  FinLoanCardsBlock,
  FinStepsBlock,
  FinClosingBlock,
  LandscapeHeroBlock,
  ChapterBlock,
  ...mayaBlocks,
  MayaPlansBlock,
  ...agencyBlocks,
  ...bizBlocks,
  RestoHeroBlock,
  RestoMenuBlock,
  RestoHoursBlock,
  SpaHeroBlock,
  SpaRitualsBlock,
  SpaClosingBlock,
  ...habitiaBlocks,
  ...devfolioBlocks,
  ...impulsaBlocks,
  ...cristalBlocks,
]

export const ecommerceRunlyBlocks = [
  ProductsGridBlock,
  ProductDetailBlock,
  CartPageBlock,
  StoreNavbarBlock,
  StoreHeroBlock,
  CollectionTilesBlock,
  TrustStripBlock,
  ProductCardBlock,
  CartBlock,
  ...mercadoBlocks,
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
  AccountPortalBlock,
  ProductDetailBlock,
  CartPageBlock,
  StoreNavbarBlock,
  StoreHeroBlock,
  CollectionTilesBlock,
  TrustStripBlock,
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
  SiteFooterBlock,
  FinHeroBlock,
  FinCalculatorBlock,
  FinLoanCardsBlock,
  FinStepsBlock,
  FinClosingBlock,
  MayaPortraitBlock,
  MayaTagBlock,
  MayaTickerBlock,
  MayaWorkBlock,
  MayaNotesBlock,
  MayaPageHeroBlock,
  MayaClosingBlock,
  MayaPlansBlock,
  AgencyHeroBlock,
  AgencyMarqueeBlock,
  AgencyWorkBlock,
  AgencyServicesBlock,
  AgencyFactsBlock,
  AgencyVoicesBlock,
  AgencyTeamBlock,
  AgencyClosingBlock,
  BizHeroBlock,
  BizPillarsBlock,
  BizKpiBandBlock,
  BizProcessBlock,
  BizCasesBlock,
  BizEngagementBlock,
  BizTrustBlock,
  BizClosingBlock,
  RestoHeroBlock,
  RestoMenuBlock,
  RestoHoursBlock,
  SpaHeroBlock,
  SpaRitualsBlock,
  SpaClosingBlock,
  HabitiaHeroBlock,
  HabitiaRoomsBlock,
  HabitiaPiecesBlock,
  HabitiaMaterialsBlock,
  HabitiaQuoteBlock,
  HabitiaLeafletBlock,
  HabitiaStoryBlock,
  HabitiaFiguresBlock,
  HabitiaPageHeroBlock,
  HabitiaClosingBlock,
}
export * from './devfolioRegistry.js'
export * from './mercadoRegistry.js'
export * from './impulsaRegistry.js'
export * from './cristalRegistry.js'

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
import './typography.css'
