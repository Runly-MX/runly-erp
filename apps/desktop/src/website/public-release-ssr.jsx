// Server-side twin of public-release-entry.jsx: renders the same tree to HTML so a published page is visible before
// its runtime downloads. Built for Node by scripts/build-website-public-runtime.mjs; the browser then hydrates it.
import { renderToString } from 'react-dom/server'
import { WebsitePageRenderer } from './WebsitePageRenderer.jsx'
import { setServerAtlasConfig } from './runlyBlocks/catalogPublicClient.js'

// Blocks whose server output cannot match the browser (rich HTML is sanitized only where a DOM exists).
const CLIENT_ONLY = new Set(['RichTextBlock'])

// `config` mirrors window.RUNLY_CONFIG in public-release-entry.jsx. renderToString is synchronous, so the module-level
// config cannot leak between requests.
export function renderPage({ page, theme, config }) {
  const blocks = Object.values(page?.publishedBuilderData?.blocks ?? {})
  setServerAtlasConfig(config)
  try { return { html: renderToString(<WebsitePageRenderer page={page} theme={theme} />), hydrate: !blocks.some((block) => CLIENT_ONLY.has(block?.type)) } }
  finally { setServerAtlasConfig(null) }
}
