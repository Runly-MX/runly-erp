import { AtlasWebBuilderProvider, AtlasWebRenderer, baseBlocks, defineTheme, defaultTheme, parsePage } from '@raulbellosom/atlas-web-builder'
import '@raulbellosom/atlas-web-builder/styles'
import {
  universalRunlyBlocks,
  ecommerceRunlyBlocks,
  bookingsRunlyBlocks,
  restaurantRunlyBlocks,
} from './runlyBlocks/index.js'
import { RunlySiteFrame } from './RunlySiteFrame.jsx'

const ALL_BLOCKS = [
  ...baseBlocks,
  ...universalRunlyBlocks,
  ...ecommerceRunlyBlocks,
  ...bookingsRunlyBlocks,
  ...restaurantRunlyBlocks,
]

export function WebsitePageRenderer({ page, theme }) {
  const resolvedTheme = theme?.tokens
    ? defineTheme({
        ...defaultTheme,
        id: 'atlas-site',
        name: 'Site Theme',
        tokens: { ...defaultTheme.tokens, ...theme.tokens },
      })
    : defaultTheme

  if (!page?.publishedBuilderData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-sm text-gray-400">Esta pagina no tiene contenido publicado aun.</p>
      </div>
    )
  }

  let parsedPage
  try {
    parsedPage =
      typeof page.publishedBuilderData === 'string'
        ? parsePage(page.publishedBuilderData)
        : parsePage(JSON.stringify(page.publishedBuilderData))
  } catch {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-sm text-gray-400">Esta pagina no tiene contenido publicado aun.</p>
      </div>
    )
  }

  return (
    <AtlasWebBuilderProvider blocks={ALL_BLOCKS} theme={resolvedTheme}>
      <RunlySiteFrame>
        <AtlasWebRenderer page={parsedPage} mode="public" />
      </RunlySiteFrame>
    </AtlasWebBuilderProvider>
  )
}
