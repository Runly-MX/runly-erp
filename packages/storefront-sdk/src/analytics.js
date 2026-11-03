const CONSENT_VALUES = new Set(['granted', 'denied'])
const FORBIDDEN_PROPERTY_PARTS = [
  'authorization',
  'cookie',
  'email',
  'message',
  'password',
  'phone',
  'token',
  'value',
]
const FORBIDDEN_PROPERTY_KEYS = new Set([
  'fields',
  'formdata',
  'formvalues',
  'payload',
  'values',
])
const MAX_QUEUE_SIZE = 100
const MAX_BATCH_SIZE = 50
const SESSION_TIMEOUT_MS = 30 * 60 * 1000
const FLUSH_INTERVAL_MS = 10 * 1000

function defaultRandomId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
}

function resolveStorage(candidate) {
  if (!candidate) return createMemoryStorage()
  try {
    const probe = '__atlas_storage_probe__'
    candidate.setItem(probe, '1')
    candidate.removeItem(probe)
    return candidate
  } catch {
    return createMemoryStorage()
  }
}

function safeProperties(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {}
  }
  const result = {}
  for (const [rawKey, value] of Object.entries(properties)) {
    if (Object.keys(result).length >= 20) break
    const key = String(rawKey).trim().slice(0, 80)
    const normalized = key.toLowerCase()
    if (
      !key ||
      FORBIDDEN_PROPERTY_KEYS.has(normalized.replace(/[^a-z0-9]/g, '')) ||
      FORBIDDEN_PROPERTY_PARTS.some((part) => normalized.includes(part))
    ) {
      continue
    }
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      result[key] = value
    } else if (typeof value === 'string') {
      result[key] = value.slice(0, 500)
    }
  }
  return result
}

function validEventName(name) {
  return typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 80 &&
    /^[a-z][a-z0-9_.:-]*$/i.test(name)
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function createAnalyticsNamespace({
  request,
  baseUrl,
  company,
  siteId: initialSiteId = null,websiteSiteId,propertyId,
  environment = {},
}) {
  const windowObject = environment.window ?? globalThis.window ?? null
  const documentObject = environment.document ?? globalThis.document ?? null
  const navigatorObject = environment.navigator ?? globalThis.navigator ?? null
  const storage = resolveStorage(
    environment.storage ?? windowObject?.localStorage ?? null,
  )
  const now = environment.now ?? (() => Date.now())
  const randomId = environment.randomId ?? defaultRandomId
  const setIntervalFn = environment.setInterval ?? globalThis.setInterval
  const clearIntervalFn = environment.clearInterval ?? globalThis.clearInterval
  const setTimeoutFn = environment.setTimeout ?? globalThis.setTimeout
  const clearTimeoutFn = environment.clearTimeout ?? globalThis.clearTimeout

  if(websiteSiteId&&propertyId)throw new TypeError("analytics: scope_conflict")
  const scopeHeaders=()=>websiteSiteId?{"X-Runly-Website-Site":websiteSiteId}:propertyId?{"X-Runly-Property":propertyId}:siteId?{"X-Runly-Site":siteId}:{}
  let siteId = initialSiteId
  let config = null
  let started = false
  let listenersInstalled = false
  let flushInterval = null
  let retryTimer = null
  let retryDelay = 1000
  let visibleSince = null
  let queue = []
  let pendingConsent = null
  const startedForms = new Set()
  const keyPrefix = () => `atlas:${company}:${siteId ?? 'default'}`
  const consentKey = () => `${keyPrefix()}:consent`
  const visitorKey = () => `${keyPrefix()}:visitor`
  const sessionKey = () => `${keyPrefix()}:session`

  function getConsent() {
    if (pendingConsent) return pendingConsent
    const value = storage.getItem(consentKey())
    return CONSENT_VALUES.has(value) ? value : 'unknown'
  }

  function dntEnabled() {
    return (
      config?.respectDoNotTrack !== false &&
      (navigatorObject?.doNotTrack === '1' ||
        windowObject?.doNotTrack === '1')
    )
  }

  function canTrack() {
    if (!config || config.analyticsMode === 'off') return false
    if (dntEnabled()) return false
    const consent = getConsent()
    if (consent === 'denied') return false
    return config.analyticsMode !== 'consent_required' || consent === 'granted'
  }

  function clearIdentity() {
    storage.removeItem(visitorKey())
    storage.removeItem(sessionKey())
  }

  function ensureContext() {
    if (!canTrack()) return null
    let visitorId = storage.getItem(visitorKey())
    if (!visitorId) {
      visitorId = randomId()
      storage.setItem(visitorKey(), visitorId)
    }

    const timestamp = now()
    let session = null
    try {
      session = JSON.parse(storage.getItem(sessionKey()) ?? 'null')
    } catch {}
    if (
      !session?.id ||
      !Number.isFinite(session.lastActivityAt) ||
      timestamp - session.lastActivityAt > SESSION_TIMEOUT_MS
    ) {
      session = { id: randomId(), lastActivityAt: timestamp }
    } else {
      session.lastActivityAt = timestamp
    }
    storage.setItem(sessionKey(), JSON.stringify(session))
    return { visitorId, sessionId: session.id }
  }

  function eventPath() {
    return windowObject?.location?.pathname || undefined
  }

  function enqueue(name, properties = {}) {
    if (!validEventName(name)) {
      throw new TypeError('analytics.track: nombre de evento invalido')
    }
    const context = ensureContext()
    if (!context) return false
    const filteredProperties = safeProperties(properties)
    const {
      formId: filteredFormId,
      submissionId: filteredSubmissionId,
      ...eventProperties
    } = filteredProperties
    queue.push({
      visitorId: context.visitorId,
      sessionId: context.sessionId,
      event: {
        id: randomId(),
        name,
        occurredAt: new Date(now()).toISOString(),
        path: eventPath(),
        ...(documentObject?.referrer
          ? { referrer: documentObject.referrer }
          : {}),
        ...(isUuid(filteredFormId)
          ? { formId: filteredFormId }
          : {}),
        ...(isUuid(filteredSubmissionId)
          ? { submissionId: filteredSubmissionId }
          : {}),
        properties: eventProperties,
      },
    })
    if (queue.length > MAX_QUEUE_SIZE) {
      queue = queue.slice(queue.length - MAX_QUEUE_SIZE)
    }
    return true
  }

  function page(properties = {}) {
    return enqueue('page_view', properties)
  }

  function track(name, properties = {}) {
    return enqueue(name, properties)
  }

  function recordVisibleTime() {
    if (visibleSince === null) return
    const seconds = Math.floor((now() - visibleSince) / 1000)
    visibleSince = null
    if (seconds > 0) enqueue('visible_time', { seconds })
  }

  function onVisibilityChange() {
    if (documentObject?.visibilityState === 'hidden') {
      recordVisibleTime()
      sendBeacon()
    } else if (canTrack()) {
      visibleSince = now()
    }
  }

  function onTaggedClick(event) {
    const element = event?.target?.closest?.('[data-atlas-event]')
    if (!element) return
    const name = element.dataset?.atlasEvent
    if (!validEventName(name)) return
    track(name, {
      element: String(element.tagName ?? '').toLowerCase(),
      ...(element.dataset?.atlasLabel
        ? { label: element.dataset.atlasLabel }
        : {}),
      ...(element.dataset?.atlasPlacement
        ? { placement: element.dataset.atlasPlacement }
        : {}),
    })
  }

  function formElement(event) {
    return event?.target?.closest?.('form[data-atlas-form-id]') ?? null
  }

  function onFormStart(event) {
    const form = formElement(event)
    const formId = form?.dataset?.atlasFormId
    if (!formId || startedForms.has(formId)) return
    startedForms.add(formId)
    track('form_start', { formId })
  }

  function onFormSubmit(event) {
    const formId = formElement(event)?.dataset?.atlasFormId
    if (formId) track('form_submit', { formId })
  }

  function installListeners() {
    if (listenersInstalled || !canTrack()) return
    documentObject?.addEventListener?.('click', onTaggedClick)
    documentObject?.addEventListener?.('focusin', onFormStart)
    documentObject?.addEventListener?.('submit', onFormSubmit)
    documentObject?.addEventListener?.('visibilitychange', onVisibilityChange)
    windowObject?.addEventListener?.('pagehide', sendBeacon)
    visibleSince =
      documentObject?.visibilityState === 'hidden' ? null : now()
    flushInterval = setIntervalFn?.(() => {
      flush().catch(() => {})
    }, FLUSH_INTERVAL_MS)
    listenersInstalled = true
  }

  function removeListeners() {
    if (!listenersInstalled) return
    documentObject?.removeEventListener?.('click', onTaggedClick)
    documentObject?.removeEventListener?.('focusin', onFormStart)
    documentObject?.removeEventListener?.('submit', onFormSubmit)
    documentObject?.removeEventListener?.('visibilitychange', onVisibilityChange)
    windowObject?.removeEventListener?.('pagehide', sendBeacon)
    if (flushInterval !== null) clearIntervalFn?.(flushInterval)
    flushInterval = null
    listenersInstalled = false
    visibleSince = null
    startedForms.clear()
  }

  function takeBatch() {
    if (queue.length === 0) return null
    const first = queue[0]
    const matching = []
    const remaining = []
    for (const entry of queue) {
      if (
        matching.length < MAX_BATCH_SIZE &&
        entry.visitorId === first.visitorId &&
        entry.sessionId === first.sessionId
      ) {
        matching.push(entry)
      } else {
        remaining.push(entry)
      }
    }
    queue = remaining
    return {
      entries: matching,
      body: {
        visitorId: first.visitorId,
        sessionId: first.sessionId,
        consent: getConsent(),
        events: matching.map((entry) => entry.event),
      },
    }
  }

  function restoreBatch(batch) {
    queue = [...batch.entries, ...queue].slice(-MAX_QUEUE_SIZE)
  }

  function scheduleRetry() {
    if (retryTimer !== null) return
    const delay = retryDelay
    retryTimer = setTimeoutFn?.(() => {
      retryTimer = null
      flush().catch(() => {})
    }, delay)
    retryDelay = Math.min(retryDelay * 2, 30_000)
  }

  async function flush() {
    if (!canTrack()) return null
    const batch = takeBatch()
    if (!batch) return null
    try {
      const result = await request(
        'POST',
        '/public/storefront/v1/events/batch',
        batch.body,
        {
          headers: scopeHeaders(),
          keepalive: true,
          credentials: 'omit',
        },
      )
      retryDelay = 1000
      if (retryTimer !== null) {
        clearTimeoutFn?.(retryTimer)
        retryTimer = null
      }
      return result?.data ?? result
    } catch (error) {
      restoreBatch(batch)
      scheduleRetry()
      throw error
    }
  }

  function sendBeacon() {
    if (!canTrack() || typeof navigatorObject?.sendBeacon !== 'function') {
      return false
    }
    const batch = takeBatch()
    if (!batch) return false
    const query = new URLSearchParams({
      company,
      ...(websiteSiteId?{websiteSiteId}:propertyId?{propertyId}:siteId ? { siteId } : {}),
    })
    const accepted = navigatorObject.sendBeacon(
      `${baseUrl}/public/storefront/v1/events/batch?${query}`,
      JSON.stringify(batch.body),
    )
    if (!accepted) restoreBatch(batch)
    return accepted
  }

  function setConsent(value) {
    if (!CONSENT_VALUES.has(value)) {
      throw new TypeError('analytics.setConsent: usa "granted" o "denied"')
    }
    const wasTrackable = canTrack()
    pendingConsent = value
    storage.setItem(consentKey(), value)
    if (value === 'denied') {
      queue = []
      clearIdentity()
      removeListeners()
      return value
    }
    if (started) {
      installListeners()
      if (!wasTrackable) page()
    }
    return value
  }

  async function start() {
    if (started) return config
    const response = await request(
      'GET',
      '/public/storefront/v1/config',
      null,
      { headers: scopeHeaders() },
    )
    config = response?.data ?? response
    siteId = config?.siteId ?? siteId
    if (pendingConsent) storage.setItem(consentKey(), pendingConsent)
    started = true
    if (canTrack()) {
      installListeners()
      page()
    }
    return config
  }

  function stop() {
    recordVisibleTime()
    sendBeacon()
    removeListeners()
    if (retryTimer !== null) clearTimeoutFn?.(retryTimer)
    retryTimer = null
    started = false
  }

  const analytics = {
    start,
    page,
    track,
    setConsent,
    getConsent,
    flush,
    stop,
  }
  Object.defineProperty(analytics, '_getContext', {
    enumerable: false,
    value: ensureContext,
  })
  return Object.freeze(analytics)
}
