import { createWebsitePublicationContext } from './website-publication-context.js'
import { serveWebsiteRelease } from '../routes/website/public-release-routes.js'
import { resolvePublicSupabaseUrl } from '../lib/supabase-public-url.js'

const BUCKET = 'runly-website'
const ASSET_EXTENSIONS = new Set([
  'js', 'mjs', 'css', 'png', 'jpg', 'jpeg', 'webp', 'svg', 'ico',
  'woff', 'woff2', 'ttf', 'eot', 'map', 'json', 'txt', 'xml', 'pdf',
])
const HTML_CACHE = new Map()
const HTML_CACHE_TTL = 5 * 60 * 1000
const HTML_CACHE_MAX = 500

export function isAssetPath(urlPath) {
  const lastSegment = urlPath.split('/').pop() ?? ''
  const dot = lastSegment.lastIndexOf('.')
  if (dot === -1) return false
  const ext = lastSegment.slice(dot + 1).toLowerCase()
  return ASSET_EXTENSIONS.has(ext)
}

export function resolveHtmlCandidates(companySlug, urlPath) {
  const clean = urlPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const base = `dist/${companySlug}/`
  const fallback = `${base}index.html`
  if (!clean) return [fallback, fallback, fallback]
  return [
    `${base}${clean}/index.html`,
    `${base}${clean}.html`,
    fallback,
  ]
}

const RUNLY_PATH_RE = /^\/(app|api|public|p|auth)\//i
const ASSET_ATTR_RE = /\b(href|src|content)="(\/(?!\/)[^"]*\.[a-zA-Z0-9]{1,10}[^"]*)"/g
// Matches href="/path" or href="/path?q=1" but NOT hrefs with file extensions (those are assets)
const NAV_LINK_RE  = /\bhref="(\/(?!\/|#)[^"#?]*)([^"]*)"/g
const HAS_EXT_RE   = /\.[a-zA-Z0-9]{1,10}(\?|$)/

export function rewriteDistHtml(html, storageBase, basePath = '', siteOrigin = '') {
  // Step 0: replace any localhost:PORT occurrences with the actual site origin.
  // Frameworks like Astro and Next.js embed the dev-server URL (e.g. localhost:4321)
  // in the build output when the `site` / base-URL option is not set for production.
  // At runtime the client-side router calls history.replaceState with that URL, which
  // makes the browser address bar show localhost instead of the real domain.
  const normalised = siteOrigin
    ? html.replace(/https?:\/\/localhost:\d+/g, siteOrigin)
    : html

  // Step 1: rewrite root-relative ASSET paths (js/css/svg/png…) to full CDN URLs
  const withAssets = normalised.replace(ASSET_ATTR_RE, (match, attr, path) => {
    if (RUNLY_PATH_RE.test(path)) return match
    return `${attr}="${storageBase}${path}"`
  })

  // Step 2: rewrite root-relative NAVIGATION links only when a non-empty basePath is set.
  // By default basePath is '' — Nginx already maps root-relative URLs to the correct API
  // path transparently, so prefixing here would cause a double-prefix on navigation clicks.
  const withNavLinks = basePath
    ? withAssets.replace(NAV_LINK_RE, (match, path, rest) => {
        if (RUNLY_PATH_RE.test(path)) return match
        if (HAS_EXT_RE.test(path)) return match
        return `href="${basePath}${path}${rest}"`
      })
    : withAssets

  // Step 3: inject importmap so dynamic import('/_astro/…') inside loaded modules
  // resolves to CDN instead of the API origin.
  const importMap = JSON.stringify({
    imports: {
      '/_astro/': `${storageBase}/_astro/`,
      // Next.js / React static export chunks live at /_next/
      '/_next/':  `${storageBase}/_next/`,
    },
  })
  const importMapTag = `<script type="importmap">${importMap}</script>`

  return withNavLinks.replace(/(<head(?:[^>]*)>)/i, `$1\n  ${importMapTag}`)
}

export function injectErpBadge(html, erpPath = '/app/') {
  // Script checks session at runtime — only shows the beacon if the visitor
  // has an active Runly session with platform.erp.access permission.
  const safePath = erpPath.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const script = [
    '<script>(function(){',
    'function gt(){try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);',
    "if(k&&k.startsWith('sb-')&&k.endsWith('-auth-token')){",
    "var d=JSON.parse(localStorage.getItem(k)||'{}');",
    'return d.access_token||(d.session&&d.session.access_token)||null;',
    '}}return null;}catch(e){return null;}}',
    'function show(){',
    "if(document.getElementById('_runly_erp_beacon'))return;",
    "var w=document.createElement('div');w.id='_runly_erp_beacon';",
    "w.style.cssText='position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;';",
    "var a=document.createElement('a');a.href='" + safePath + "';",
    "a.style.cssText='display:flex;align-items:center;gap:0;background:rgba(8,8,20,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#e2e8f0;padding:10px;border-radius:100px;text-decoration:none;font-size:12px;font-weight:600;overflow:hidden;max-width:40px;transition:max-width .25s,padding .25s,gap .25s;box-shadow:0 4px 20px rgba(0,0,0,0.45),0 0 0 1px rgba(255,255,255,0.08);';",
    "var s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('width','20');s.setAttribute('height','20');s.setAttribute('viewBox','0 0 20 20');s.setAttribute('fill','none');s.style.flexShrink='0';",
    "var r=document.createElementNS('http://www.w3.org/2000/svg','rect');r.setAttribute('width','20');r.setAttribute('height','20');r.setAttribute('rx','6');r.setAttribute('fill','#6366f1');",
    "var p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d','M6 10h8M10 6v8');p.setAttribute('stroke','#fff');p.setAttribute('stroke-width','1.5');p.setAttribute('stroke-linecap','round');",
    's.appendChild(r);s.appendChild(p);',
    "var l=document.createElement('span');l.textContent='Runly ERP';l.style.cssText='white-space:nowrap;transition:opacity .15s;opacity:0;';",
    'a.appendChild(s);a.appendChild(l);',
    "var isTch=navigator.maxTouchPoints>0||('ontouchstart' in window);",
    "if(isTch){",
    "a.style.maxWidth='none';a.style.padding='12px 16px 12px 12px';a.style.gap='8px';a.style.transition='none';l.style.opacity='1';l.style.transition='none';",
    "}else{",
    "a.addEventListener('mouseover',function(){a.style.maxWidth='160px';a.style.padding='9px 14px 9px 10px';a.style.gap='8px';l.style.opacity='1';});",
    "a.addEventListener('mouseout',function(){a.style.maxWidth='40px';a.style.padding='10px';a.style.gap='0';l.style.opacity='0';});",
    "}",
    'w.appendChild(a);document.body.appendChild(w);}',
    'function chk(){var t=gt();if(!t)return;',
    "fetch('/erp-badge-check',{headers:{'Authorization':'Bearer '+t},cache:'no-store'})",
    '.then(function(r){return r.ok?r.json():null;})',
    '.then(function(d){if(d&&d.show)show();})',
    '.catch(function(){});}',
    "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',chk);}else{setTimeout(chk,0);}",
    '})()',
    '<' + '/script>',
  ].join('')
  if (html.includes('</body>')) {
    return html.replace('</body>', `${script}\n</body>`)
  }
  return html + script
}

export function injectRunlyConfig(html, {
  supabaseUrl,
  supabaseAnonKey,
  apiUrl,
  company,
  siteName,
  siteId,
  analyticsMode,
  turnstileSiteKey,
  stripePublishableKey,
  currency,
}) {
  if (!supabaseUrl) return html
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  const payload = { supabaseUrl, supabaseAnonKey, apiUrl, storageKey, company: company || '', siteName: siteName || '' }
  if (siteId) payload.siteId = siteId
  if (analyticsMode) payload.analyticsMode = analyticsMode
  if (turnstileSiteKey) payload.turnstileSiteKey = turnstileSiteKey
  if (stripePublishableKey) payload.stripePublishableKey = stripePublishableKey
  if (currency) payload.currency = currency
  const raw  = JSON.stringify(payload)
  const safe = raw.replace(/<\//g, '<\\/')
  const tag  = `<script>window.RUNLY_CONFIG=${safe};<\/script>`
  const sdkTag = '<script src="/public/site/runly-sdk.js" defer></script>'
  return html.replace(/(<head(?:[^>]*)>)/i, `$1\n  ${tag}\n  ${sdkTag}`)
}

export function injectSeoTags(html, seoDefaults) {
  if (!seoDefaults) return html
  const tags = []

  if (seoDefaults.title && !html.includes('<title>')) {
    tags.push(`<title>${escapeHtml(seoDefaults.title)}</title>`)
  }
  if (seoDefaults.description && !html.includes('name="description"')) {
    tags.push(`<meta name="description" content="${escapeHtml(seoDefaults.description)}" />`)
  }
  if (seoDefaults.ogTitle && !html.includes('property="og:title"')) {
    tags.push(`<meta property="og:title" content="${escapeHtml(seoDefaults.ogTitle)}" />`)
  }
  if (seoDefaults.ogDescription && !html.includes('property="og:description"')) {
    tags.push(`<meta property="og:description" content="${escapeHtml(seoDefaults.ogDescription)}" />`)
  }
  if (seoDefaults.ogImage && !html.includes('property="og:image"')) {
    tags.push(`<meta property="og:image" content="${escapeHtml(seoDefaults.ogImage)}" />`)
  }
  if (seoDefaults.robots && !html.includes('name="robots"')) {
    tags.push(`<meta name="robots" content="${escapeHtml(seoDefaults.robots)}" />`)
  }
  if (seoDefaults.canonical && !html.includes('rel="canonical"')) {
    tags.push(`<link rel="canonical" href="${escapeHtml(seoDefaults.canonical)}" />`)
  }

  if (tags.length === 0) return html
  return html.replace('<head>', `<head>\n  ${tags.join('\n  ')}`)
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function getCacheKey(companyId, urlPath) {
  return `${companyId}:${urlPath}`
}

function getCached(key) {
  const entry = HTML_CACHE.get(key)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > HTML_CACHE_TTL) { HTML_CACHE.delete(key); return null }
  return entry.html
}

function setCache(key, html) {
  if (HTML_CACHE.size >= HTML_CACHE_MAX) {
    const firstKey = HTML_CACHE.keys().next().value
    HTML_CACHE.delete(firstKey)
  }
  HTML_CACHE.set(key, { html, cachedAt: Date.now() })
}

export function invalidateCache(companyId) {
  for (const key of HTML_CACHE.keys()) {
    if (key.startsWith(`${companyId}:`)) HTML_CACHE.delete(key)
  }
}

let _primaryCompanyCache = null
let _primaryCompanyCachedAt = 0
const COMPANY_CACHE_TTL = 60_000

// Multi-tenant domain routing (spec §11): a shared instance can host more
// than one company's public website, distinguished by which domain the
// visitor actually typed. Keyed by normalized hostname (never the raw
// Host header) so http/https, a trailing :port, and a leading "www." don't
// cause a spurious miss. Populated from every enabled website_site row that
// has a domain set — small table, safe to hold in full.
let _siteByDomainCache = null
let _siteByDomainCachedAt = 0

export function invalidatePrimaryCache() {
  _primaryCompanyCache = null
  _primaryCompanyCachedAt = 0
  _siteByDomainCache = null
  _siteByDomainCachedAt = 0
}

// Exported for unit testing — pure, no I/O.
export function normalizeHost(input) {
  if (!input) return null
  let h = String(input).trim().toLowerCase()
  h = h.replace(/^https?:\/\//, '')
  h = h.split('/')[0]
  h = h.split(':')[0]
  h = h.replace(/^www\./, '')
  return h || null
}

export function createDistServeService({ prisma, supabaseAdmin, publicationContext }) {
  const publication = publicationContext ?? createWebsitePublicationContext({prisma,supabaseAdmin})
  async function resolveSiteForRequest(c) {
    const snapshot=await publication.gateway.resolve(c), site=snapshot.site
    return {id:site.id,company_id:site.companyId,company_slug:snapshot.company.slug,source_type:site.sourceType,
      site_name:site.name,domain:snapshot.hostname,seo_defaults:site.seoDefaults,analytics_mode:site.analyticsMode,
      turnstile_site_key:site.turnstileSiteKey,stripe_publishable_key:site.stripePublishableKey,stripe_currency:site.stripeCurrency}
  }

  async function serve(c, urlPath) {
    let site
    try {
      const releaseResponse = await serveWebsiteRelease(c,publication.gateway,urlPath,publication.runtime)
      if(releaseResponse)return releaseResponse
      site = await resolveSiteForRequest(c)
    } catch (err) {
      // DB connection timeout or transient failure — return 503 instead of crashing
      if(err.status&&err.status!==503)return c.json({error:'Sitio no disponible'},err.status===422?404:err.status)
      return c.text('Servicio temporalmente no disponible. Intenta de nuevo en unos segundos.', 503)
    }

    if (!site) {
      return c.json({ error: 'Sitio no configurado' }, 404)
    }

    const sourceType = site.source_type

    if (!sourceType || sourceType === 'none') {
      return c.json({ error: 'Sitio no disponible' }, 404)
    }

    if (sourceType === 'builder') {
      return null // signal to caller: nginx will fall back to React SPA
    }

    return c.json({error:'Aislamiento ZIP pendiente.',code:'isolation_required'},409)
  }

  return { serve, invalidatePrimaryCache, resolveSiteForRequest }
}
