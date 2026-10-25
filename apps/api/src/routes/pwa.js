import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as LucideIcons from 'lucide-react'
import sharp from 'sharp'
import { validateModulePwaIdentity } from '@runly/module-engine'
import { loadModuleLogo } from './pwa-icon-source.js'
import { applyStudioBranding } from '../../../shared/studio/identity.js'

const MODULE_KEY_RE = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9_-]*)+$/
const ICON_SIZES = new Set([192, 512])
const iconCache = new Map()

function hashIdentity(moduleRow, logoHash = null) {
  return createHash('sha256')
    .update(JSON.stringify({
      key: moduleRow.key,
      version: moduleRow.version,
      name: moduleRow.manifest?.name,
      description: moduleRow.manifest?.description,
      icon: moduleRow.manifest?.icon,
      color: moduleRow.manifest?.color,
      logoUrl: moduleRow.manifest?.logoUrl,
      logoHash,
      pwa: moduleRow.manifest?.pwa,
    }))
    .digest('hex')
}

function normalizeStartUrl(moduleKey, startPath) {
  return startPath === '/'
    ? `/app/m/${moduleKey}/`
    : `/app/m/${moduleKey}${startPath}`
}

function isAvailableModule(moduleRow) {
  if (
    !moduleRow ||
    moduleRow.status !== 'INSTALLED' ||
    moduleRow.enabled === false
  ) {
    return false
  }

  return validateModulePwaIdentity(moduleRow.manifest).valid
}

async function findPwaModule(prisma, moduleKey) {
  if (!MODULE_KEY_RE.test(moduleKey)) return null

  const moduleRow = await prisma.runlyModule.findUnique({
    where: { key: moduleKey },
    select: {
      key: true,
      version: true,
      status: true,
      enabled: true,
      manifest: true,
    },
  })

  return isAvailableModule(moduleRow) ? applyStudioBranding(moduleRow) : null
}

function buildWebManifest(moduleRow, identityHash) {
  const manifest = moduleRow.manifest
  const moduleKey = moduleRow.key
  const startUrl = normalizeStartUrl(moduleKey, manifest.pwa.startPath)

  return {
    name: `${manifest.name} — Runly`,
    short_name: manifest.pwa.shortName,
    description: manifest.description ?? '',
    id: `/pwa/apps/${moduleKey}`,
    start_url: startUrl,
    // Scope the installed PWA to the module's own route subtree so multiple
    // module PWAs don't collide on a shared '/' scope.
    scope: `/app/m/${moduleKey}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0A1D44',
    theme_color: manifest.color,
    lang: 'es-MX',
    categories: ['business', 'productivity'],
    prefer_related_applications: false,
    icons: [192, 512].map((size) => ({
      src: `/pwa/icon/${moduleKey}/${size}.png?v=${identityHash.slice(0, 12)}`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any maskable',
    })),
  }
}

function matchesEtag(c, etag) {
  return c.req.header('if-none-match') === etag
}

async function resolveModuleVisual(moduleRow, loadLogo) {
  const logo = await loadLogo(moduleRow.manifest?.logoUrl)
  if (logo?.invalid) return null

  return {
    logo,
    identityHash: hashIdentity(moduleRow, logo?.hash ?? null),
  }
}

async function renderModuleIcon(moduleRow, size, visual) {
  const { identityHash, logo } = visual
  const cacheKey = `${identityHash}:${size}`
  const cached = iconCache.get(cacheKey)
  if (cached) return { buffer: cached, identityHash }

  const manifest = moduleRow.manifest
  if (logo?.buffer) {
    const buffer = await sharp(logo.buffer)
      .resize(size, size)
      .png()
      .toBuffer()

    iconCache.set(cacheKey, buffer)
    return { buffer, identityHash }
  }

  const Icon = LucideIcons[manifest.icon]
  if (!Icon) return null

  const iconMarkup = renderToStaticMarkup(
    createElement(Icon, {
      x: 88,
      y: 88,
      width: 336,
      height: 336,
      color: '#ffffff',
      strokeWidth: 1.8,
    }),
  )
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
      `<rect width="512" height="512" rx="112" fill="${manifest.color}"/>` +
      iconMarkup +
      `</svg>`,
  )
  const buffer = await sharp(svg)
    .resize(size, size)
    .png()
    .toBuffer()

  iconCache.set(cacheKey, buffer)
  return { buffer, identityHash }
}

export function createPwaRouter({
  prisma,
  loadLogo = loadModuleLogo,
}) {
  const router = new Hono()

  router.get('/manifest/:moduleFile', async (c) => {
    const moduleFile = c.req.param('moduleFile')
    if (!moduleFile.endsWith('.webmanifest')) {
      return c.json({ error: 'Manifest no encontrado.' }, 404)
    }

    const moduleKey = moduleFile.slice(0, -'.webmanifest'.length)
    const moduleRow = await findPwaModule(prisma, moduleKey)
    if (!moduleRow) return c.json({ error: 'Modulo no encontrado.' }, 404)

    const visual = await resolveModuleVisual(moduleRow, loadLogo)
    if (!visual) return c.json({ error: 'Icono no disponible.' }, 404)

    const { identityHash } = visual
    const body = JSON.stringify(buildWebManifest(moduleRow, identityHash))
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`
    c.header('Content-Type', 'application/manifest+json')
    c.header('Cache-Control', 'public, max-age=300, must-revalidate')
    c.header('ETag', etag)
    if (matchesEtag(c, etag)) return c.body(null, 304)
    return c.body(body)
  })

  router.get('/icon/:moduleKey/:sizeFile', async (c) => {
    const moduleKey = c.req.param('moduleKey')
    const sizeFile = c.req.param('sizeFile')
    const match = sizeFile.match(/^(\d+)\.png$/)
    const size = match ? Number(match[1]) : null
    if (!size || !ICON_SIZES.has(size)) {
      return c.json({ error: 'Icono no encontrado.' }, 404)
    }

    const moduleRow = await findPwaModule(prisma, moduleKey)
    if (!moduleRow) return c.json({ error: 'Modulo no encontrado.' }, 404)

    const visual = await resolveModuleVisual(moduleRow, loadLogo)
    if (!visual) return c.json({ error: 'Icono no disponible.' }, 404)

    const rendered = await renderModuleIcon(moduleRow, size, visual)
    if (!rendered) return c.json({ error: 'Icono no disponible.' }, 404)

    const etag = `"${rendered.identityHash}-${size}"`
    c.header('Content-Type', 'image/png')
    c.header(
      'Cache-Control',
      c.req.query('v')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=300, must-revalidate',
    )
    c.header('ETag', etag)
    if (matchesEtag(c, etag)) return c.body(null, 304)
    return c.body(rendered.buffer)
  })

  return router
}
