import {
  RUNLY_SERVER_STORE_FILE,
  RUNLY_SERVER_URL_KEY,
} from './appConfig.js'
import { getConfiguredApiUrl, setApiUrl } from './runtimeConfig.js'
import { isBundledDesktop } from '@runly/core/native-runtime'

let storePromise = null

export function isTauriRuntime() {
  // Historical name: these callers specifically manage the Desktop server picker.
  return isBundledDesktop()
}

export function normalizeServerUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function getFallbackServerUrl() {
  return normalizeServerUrl(getConfiguredApiUrl())
}

async function getStore() {
  if (!isTauriRuntime()) return null
  if (!storePromise) {
    storePromise = import('@tauri-apps/plugin-store').then(({ load }) =>
      load(RUNLY_SERVER_STORE_FILE, { autoSave: false }),
    )
  }
  return storePromise
}

export async function getServerUrl() {
  if (!isTauriRuntime()) {
    const fallbackUrl = getFallbackServerUrl()
    if (fallbackUrl) setApiUrl(fallbackUrl)
    return fallbackUrl
  }

  const store = await getStore()
  const storedUrl = await store.get(RUNLY_SERVER_URL_KEY)
  const normalizedUrl = normalizeServerUrl(storedUrl)
  if (normalizedUrl) {
    setApiUrl(normalizedUrl)
  }
  return normalizedUrl
}

export async function setServerUrl(url) {
  const normalizedUrl = normalizeServerUrl(url)
  if (!normalizedUrl) {
    throw new Error('INVALID_SERVER_URL')
  }

  setApiUrl(normalizedUrl)

  if (!isTauriRuntime()) {
    return normalizedUrl
  }

  const store = await getStore()
  await store.set(RUNLY_SERVER_URL_KEY, normalizedUrl)
  await store.save()
  return normalizedUrl
}

export async function clearServerUrl() {
  if (!isTauriRuntime()) return

  const store = await getStore()
  await store.set(RUNLY_SERVER_URL_KEY, null)
  await store.save()
}
