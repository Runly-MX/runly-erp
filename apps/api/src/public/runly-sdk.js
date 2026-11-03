;(function (global) {
  'use strict'

  // ── Config (injected by Runly into window.RUNLY_CONFIG; window.ATLAS_CONFIG
  // is still read as a fallback for pages generated before this rename) ────────
  var cfg             = global.RUNLY_CONFIG || global.ATLAS_CONFIG || {}
  var SUPABASE_URL    = (cfg.supabaseUrl    || '').replace(/\/$/, '')
  var SUPABASE_KEY    = cfg.supabaseAnonKey || ''
  var API_URL         = (cfg.apiUrl         || '/').replace(/\/$/, '')
  var STORAGE_KEY     = cfg.storageKey      || ''

  // ── Session helpers ───────────────────────────────────────────────────────────
  function readSession() {
    if (!STORAGE_KEY) return null
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch (e) { return null }
  }

  function writeSession(session) {
    if (!STORAGE_KEY) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)) } catch (e) {}
  }

  function deleteSession() {
    if (!STORAGE_KEY) return
    try { localStorage.removeItem(STORAGE_KEY) } catch (e) {}
  }

  function isExpired(session) {
    if (!session || !session.expires_at) return true
    return (session.expires_at - 10) < Math.floor(Date.now() / 1000)
  }

  // ── Supabase Auth REST helper ─────────────────────────────────────────────────
  function supabaseFetch(path, options) {
    var headers = Object.assign(
      { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      options.headers || {}
    )
    return fetch(SUPABASE_URL + path, Object.assign({}, options, { headers: headers }))
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d } })
      })
  }

  // ── Auth state observers ──────────────────────────────────────────────────────
  var _listeners = []

  function notify(event, session) {
    _listeners.forEach(function (cb) { try { cb(event, session) } catch (e) {} })
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', function (e) {
      if (e.key === STORAGE_KEY) notify('TOKEN_REFRESHED', readSession())
    })
  }

  // ── Auth API ──────────────────────────────────────────────────────────────────
  var auth = {
    getSession: function () {
      return new Promise(function (resolve) {
        var session = readSession()
        if (!session) return resolve(null)
        if (!isExpired(session)) return resolve(session)
        if (!session.refresh_token) { deleteSession(); return resolve(null) }

        supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        }).then(function (res) {
          if (res.ok && res.data.access_token) {
            writeSession(res.data)
            notify('TOKEN_REFRESHED', res.data)
            resolve(res.data)
          } else {
            deleteSession()
            notify('SIGNED_OUT', null)
            resolve(null)
          }
        }).catch(function () { resolve(null) })
      })
    },

    getToken: function () {
      var session = readSession()
      if (!session || isExpired(session)) return null
      return session.access_token || null
    },

    signIn: function (credentials) {
      return supabaseFetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email: credentials.email, password: credentials.password }),
      }).then(function (res) {
        if (res.ok && res.data.access_token) {
          writeSession(res.data)
          notify('SIGNED_IN', res.data)
          return { session: res.data, error: null }
        }
        var msg = res.data.error_description || res.data.msg || 'Login fallido'
        return { session: null, error: new Error(msg) }
      }).catch(function (err) {
        return { session: null, error: err }
      })
    },

    signOut: function () {
      var token = auth.getToken()
      deleteSession()
      notify('SIGNED_OUT', null)
      if (!token) return Promise.resolve()
      return supabaseFetch('/auth/v1/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
      }).then(function () {}).catch(function () {})
    },

    onAuthStateChange: function (callback) {
      _listeners.push(callback)
      return function () {
        _listeners = _listeners.filter(function (c) { return c !== callback })
      }
    },
  }

  // ── renderLogin ───────────────────────────────────────────────────────────────
  function renderLogin(selector, options) {
    var opts   = options || {}
    var target = typeof selector === 'string' ? document.querySelector(selector) : selector
    if (!target) return

    var labels   = opts.labels || {}
    var title    = labels.title    || 'Iniciar sesion'
    var subtitle = labels.subtitle || 'Accede a tu cuenta para continuar.'
    var btnLabel = labels.button   || 'Entrar'
    var theme    = opts.theme      || 'auto'

    // CSS variables
    var lightVars = [
      '--ae-bg:#ffffff', '--ae-fg:#111827', '--ae-muted:#6b7280',
      '--ae-border:#e5e7eb', '--ae-input-bg:#f9fafb',
      '--ae-primary:#4f46e5', '--ae-primary-fg:#ffffff',
      '--ae-error-bg:#fef2f2', '--ae-error-border:#fecaca', '--ae-error-fg:#dc2626',
    ].join(';')
    var darkVars = [
      '--ae-bg:#111827', '--ae-fg:#f9fafb', '--ae-muted:#9ca3af',
      '--ae-border:#374151', '--ae-input-bg:#1f2937',
      '--ae-primary:#6366f1', '--ae-primary-fg:#ffffff',
      '--ae-error-bg:#1f0a0a', '--ae-error-border:#7f1d1d', '--ae-error-fg:#f87171',
    ].join(';')

    var styleId = '_ae_login_style'
    if (!document.getElementById(styleId)) {
      var styleEl = document.createElement('style')
      styleEl.id  = styleId
      styleEl.textContent = [
        '._ae-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box;width:100%;max-width:360px}',
        '._ae-wrap *{box-sizing:border-box}',
        '._ae-title{font-size:1.25rem;font-weight:700;color:var(--ae-fg);margin:0 0 4px}',
        '._ae-subtitle{font-size:.875rem;color:var(--ae-muted);margin:0 0 24px}',
        '._ae-label{display:block;font-size:.875rem;font-weight:500;color:var(--ae-fg);margin-bottom:4px}',
        '._ae-input{width:100%;padding:10px 14px;border:1px solid var(--ae-border);border-radius:8px;background:var(--ae-input-bg);color:var(--ae-fg);font-size:.875rem;outline:none;transition:border-color .15s}',
        '._ae-input:focus{border-color:var(--ae-primary)}',
        '._ae-field{margin-bottom:16px}',
        '._ae-btn{width:100%;padding:10px;border:none;border-radius:8px;background:var(--ae-primary);color:var(--ae-primary-fg);font-size:.875rem;font-weight:600;cursor:pointer;opacity:1;transition:opacity .15s}',
        '._ae-btn:hover:not(:disabled){opacity:.88}',
        '._ae-btn:disabled{opacity:.5;cursor:not-allowed}',
        '._ae-error{padding:10px 14px;border-radius:8px;font-size:.875rem;background:var(--ae-error-bg);border:1px solid var(--ae-error-border);color:var(--ae-error-fg);margin-bottom:16px}',
      ].join('\n')
      document.head.appendChild(styleEl)
    }

    var resolvedDark = (
      theme === 'dark' ||
      (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches)
    )

    target.innerHTML = ''

    var wrap = document.createElement('div')
    wrap.className = '_ae-wrap'
    wrap.setAttribute('style', resolvedDark ? darkVars : lightVars)

    var h2 = document.createElement('h2')
    h2.className   = '_ae-title'
    h2.textContent = title

    var p = document.createElement('p')
    p.className   = '_ae-subtitle'
    p.textContent = subtitle

    var form = document.createElement('form')
    form.setAttribute('autocomplete', 'on')

    function makeField(id, type, labelText, autoComplete) {
      var div = document.createElement('div')
      div.className = '_ae-field'
      var lbl = document.createElement('label')
      lbl.className    = '_ae-label'
      lbl.htmlFor      = id
      lbl.textContent  = labelText
      var inp = document.createElement('input')
      inp.type         = type
      inp.id           = id
      inp.name         = id
      inp.className    = '_ae-input'
      inp.autocomplete = autoComplete
      inp.required     = true
      div.appendChild(lbl)
      div.appendChild(inp)
      return { div: div, input: inp }
    }

    var emailF    = makeField('_ae_email',    'email',    'Correo electronico', 'email')
    var passwordF = makeField('_ae_password', 'password', 'Contrasena',         'current-password')

    var errorDiv = document.createElement('div')
    errorDiv.className     = '_ae-error'
    errorDiv.style.display = 'none'

    var btn = document.createElement('button')
    btn.type        = 'submit'
    btn.className   = '_ae-btn'
    btn.textContent = btnLabel

    form.appendChild(emailF.div)
    form.appendChild(passwordF.div)
    form.appendChild(errorDiv)
    form.appendChild(btn)

    wrap.appendChild(h2)
    wrap.appendChild(p)
    wrap.appendChild(form)
    target.appendChild(wrap)

    form.addEventListener('submit', function (e) {
      e.preventDefault()
      errorDiv.style.display = 'none'
      btn.disabled    = true
      btn.textContent = 'Ingresando...'

      auth.signIn({ email: emailF.input.value.trim(), password: passwordF.input.value })
        .then(function (result) {
          if (result.error || !result.session) {
            var msg = result.error ? result.error.message : 'Credenciales invalidas'
            if (/invalid/i.test(msg)) msg = 'Correo o contrasena incorrectos.'
            errorDiv.textContent   = msg
            errorDiv.style.display = 'block'
            btn.disabled           = false
            btn.textContent        = btnLabel
            if (opts.onError) opts.onError(result.error || new Error(msg))
            return
          }
          if (opts.onSuccess) opts.onSuccess(result.session)
          if (opts.redirectTo) window.location.href = opts.redirectTo
        })
        .catch(function (err) {
          errorDiv.textContent   = 'Error inesperado. Intenta de nuevo.'
          errorDiv.style.display = 'block'
          btn.disabled           = false
          btn.textContent        = btnLabel
          if (opts.onError) opts.onError(err)
        })
    })
  }

  // ── Expose ────────────────────────────────────────────────────────────────────
  global.RunlyERP = {
    config: {
      supabaseUrl: SUPABASE_URL,
      apiUrl:      API_URL,
      storageKey:  STORAGE_KEY,
    },
    auth:        auth,
    renderLogin: renderLogin,
  }
  // Kept as a live reference (not a copy) so pages embedded before this rename
  // that call window.AtlasERP.* keep working against the same object.
  global.AtlasERP = global.RunlyERP

})(window)

;(function (global) {
  'use strict'

  var cfg = global.RUNLY_CONFIG || global.ATLAS_CONFIG || {}
  var API_URL = (cfg.apiUrl || '/').replace(/\/$/, '')
  var COMPANY = cfg.company || ''
  var SITE_ID = cfg.siteId || ''
  var config = null
  var startPromise = null
  var started = false
  var queue = []
  var intervalId = null
  var listenersInstalled = false
  var visibleSince = null
  var startedForms = {}
  var MAX_QUEUE = 100
  var MAX_BATCH = 50
  var SESSION_MS = 30 * 60 * 1000

  function storageKey(name) {
    return 'runly:' + COMPANY + ':' + (SITE_ID || 'default') + ':' + name
  }

  function readStorage(name) {
    try { return global.localStorage.getItem(storageKey(name)) } catch (e) { return null }
  }

  function writeStorage(name, value) {
    try { global.localStorage.setItem(storageKey(name), value) } catch (e) {}
  }

  function removeStorage(name) {
    try { global.localStorage.removeItem(storageKey(name)) } catch (e) {}
  }

  function randomId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID()
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
  }

  function getConsent() {
    var value = readStorage('consent')
    return value === 'granted' || value === 'denied' ? value : 'unknown'
  }

  function dntEnabled() {
    if (config && config.respectDoNotTrack === false) return false
    return (
      (global.navigator && global.navigator.doNotTrack === '1') ||
      global.doNotTrack === '1'
    )
  }

  function canTrack() {
    if (!config || config.analyticsMode === 'off' || dntEnabled()) return false
    var consent = getConsent()
    if (consent === 'denied') return false
    return config.analyticsMode !== 'consent_required' || consent === 'granted'
  }

  function context() {
    if (!canTrack()) return null
    var visitorId = readStorage('visitor')
    if (!visitorId) {
      visitorId = randomId()
      writeStorage('visitor', visitorId)
    }
    var now = Date.now()
    var session = null
    try { session = JSON.parse(readStorage('session') || 'null') } catch (e) {}
    if (
      !session ||
      !session.id ||
      !session.lastActivityAt ||
      now - session.lastActivityAt > SESSION_MS
    ) {
      session = { id: randomId(), lastActivityAt: now }
    } else {
      session.lastActivityAt = now
    }
    writeStorage('session', JSON.stringify(session))
    return { visitorId: visitorId, sessionId: session.id }
  }

  function safeProperties(properties) {
    var source = properties && typeof properties === 'object' ? properties : {}
    var safe = {}
    var count = 0
    var forbiddenParts = [
      'authorization', 'cookie', 'email', 'message',
      'password', 'phone', 'token', 'value',
    ]
    var forbiddenKeys = {
      fields: true,
      formdata: true,
      formvalues: true,
      payload: true,
      values: true,
    }
    Object.keys(source).forEach(function (rawKey) {
      if (count >= 20) return
      var key = String(rawKey).trim().slice(0, 80)
      var normalized = key.toLowerCase()
      if (!key || forbiddenKeys[normalized.replace(/[^a-z0-9]/g, '')]) return
      if (forbiddenParts.some(function (part) { return normalized.indexOf(part) !== -1 })) return
      var value = source[rawKey]
      if (
        value === null ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && isFinite(value))
      ) {
        safe[key] = value
        count += 1
      } else if (typeof value === 'string') {
        safe[key] = value.slice(0, 500)
        count += 1
      }
    })
    return safe
  }

  function validEventName(name) {
    return (
      typeof name === 'string' &&
      name.length > 0 &&
      name.length <= 80 &&
      /^[a-z][a-z0-9_.:-]*$/i.test(name)
    )
  }

  function isUuid(value) {
    return (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    )
  }

  function headers(extra) {
    return Object.assign(
      {
        'Content-Type': 'application/json',
        'X-Runly-Company': COMPANY,
        ...(cfg.websiteSiteId || global.document.documentElement?.dataset?.release ? { 'X-Runly-Website-Site': cfg.websiteSiteId || cfg.siteId } : cfg.propertyId ? { 'X-Runly-Property': cfg.propertyId } : { 'X-Runly-Site': SITE_ID }),
        ...(global.document.documentElement?.dataset?.pageId ? { 'X-Runly-Page': global.document.documentElement.dataset.pageId } : {}),
      },
      extra || {}
    )
  }

  function request(path, options) {
    var requestOptions = options || {}
    return global.fetch(API_URL + path, Object.assign({}, requestOptions, {
      headers: headers(requestOptions.headers),
    })).then(function (response) {
      return response.text().then(function (text) {
        var data = null
        try { data = text ? JSON.parse(text) : null } catch (e) { data = text }
        if (!response.ok) {
          var error = new Error(data && data.error ? data.error : 'Error ' + response.status)
          error.status = response.status
          error.code = data && data.code ? data.code : 'UNKNOWN'
          error.details = data && data.details ? data.details : null
          throw error
        }
        return data
      })
    })
  }

  function track(name, properties) {
    if (!validEventName(name)) throw new TypeError('Nombre de evento invalido')
    var current = context()
    if (!current) return false
    var safe = safeProperties(properties)
    var formId = safe.formId
    var submissionId = safe.submissionId
    delete safe.formId
    delete safe.submissionId
    var event = {
      id: randomId(),
      name: name,
      occurredAt: new Date().toISOString(),
      path: global.location && global.location.pathname,
      properties: safe,
    }
    if (global.document.referrer) event.referrer = global.document.referrer
    if (isUuid(formId)) event.formId = formId
    if (isUuid(submissionId)) event.submissionId = submissionId
    queue.push({
      visitorId: current.visitorId,
      sessionId: current.sessionId,
      event: event,
    })
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE)
    return true
  }

  function page(properties) {
    return track('page_view', properties || {})
  }

  function takeBatch() {
    if (!queue.length) return null
    var first = queue[0]
    var entries = []
    var remaining = []
    queue.forEach(function (entry) {
      if (
        entries.length < MAX_BATCH &&
        entry.visitorId === first.visitorId &&
        entry.sessionId === first.sessionId
      ) {
        entries.push(entry)
      } else {
        remaining.push(entry)
      }
    })
    queue = remaining
    return {
      entries: entries,
      body: {
        visitorId: first.visitorId,
        sessionId: first.sessionId,
        consent: getConsent(),
        events: entries.map(function (entry) { return entry.event }),
      },
    }
  }

  function restoreBatch(batch) {
    queue = batch.entries.concat(queue).slice(-MAX_QUEUE)
  }

  function flush() {
    if (!canTrack()) return Promise.resolve(null)
    var batch = takeBatch()
    if (!batch) return Promise.resolve(null)
    return request('/public/storefront/v1/events/batch', {
      method: 'POST',
      body: JSON.stringify(batch.body),
      keepalive: true,
      credentials: 'omit',
    }).then(function (result) {
      return result && result.data ? result.data : result
    }).catch(function (error) {
      restoreBatch(batch)
      throw error
    })
  }

  function beacon() {
    if (
      !canTrack() ||
      !global.navigator ||
      typeof global.navigator.sendBeacon !== 'function'
    ) {
      return false
    }
    var batch = takeBatch()
    if (!batch) return false
    var query = new URLSearchParams({company:COMPANY,...(cfg.websiteSiteId||global.document.documentElement?.dataset?.release?{websiteSiteId:cfg.websiteSiteId||cfg.siteId}:cfg.propertyId?{propertyId:cfg.propertyId}:{siteId:SITE_ID})})
    var accepted = global.navigator.sendBeacon(
      API_URL + '/public/storefront/v1/events/batch?' + query.toString(),
      JSON.stringify(batch.body)
    )
    if (!accepted) restoreBatch(batch)
    return accepted
  }

  function recordVisibleTime() {
    if (visibleSince === null) return
    var seconds = Math.floor((Date.now() - visibleSince) / 1000)
    visibleSince = null
    if (seconds > 0) track('visible_time', { seconds: seconds })
  }

  function closestForm(target) {
    return target && target.closest
      ? target.closest('form[data-runly-form-id]')
      : null
  }

  // data-atlas-event/-label/-placement are authored by hand by site builders
  // in their own custom HTML/code blocks (see the Growth Analytics help text),
  // so existing customer content keeps working — data-runly-* is preferred
  // for anything authored from here on.
  function onTaggedClick(event) {
    var element = event.target && event.target.closest
      ? event.target.closest('[data-runly-event], [data-atlas-event]')
      : null
    if (!element) return
    var eventName = element.dataset.runlyEvent || element.dataset.atlasEvent
    if (!validEventName(eventName)) return
    track(eventName, {
      element: String(element.tagName || '').toLowerCase(),
      label: element.dataset.runlyLabel || element.dataset.atlasLabel || null,
      placement: element.dataset.runlyPlacement || element.dataset.atlasPlacement || null,
    })
  }

  function onFormStart(event) {
    var form = closestForm(event.target)
    if (form && form.dataset.runlyManaged === 'true') return
    var formId = form && form.dataset.runlyFormId
    if (!formId || startedForms[formId]) return
    startedForms[formId] = true
    track('form_start', { formId: formId })
  }

  function onFormSubmit(event) {
    var form = closestForm(event.target)
    if (form && form.dataset.runlyManaged === 'true') return
    var formId = form && form.dataset.runlyFormId
    if (formId) track('form_submit', { formId: formId })
  }

  function onVisibilityChange() {
    if (global.document.visibilityState === 'hidden') {
      recordVisibleTime()
      beacon()
    } else if (canTrack()) {
      visibleSince = Date.now()
    }
  }

  function installListeners() {
    if (listenersInstalled || !canTrack()) return
    global.document.addEventListener('click', onTaggedClick)
    global.document.addEventListener('focusin', onFormStart)
    global.document.addEventListener('submit', onFormSubmit)
    global.document.addEventListener('visibilitychange', onVisibilityChange)
    global.addEventListener('pagehide', beacon)
    visibleSince = global.document.visibilityState === 'hidden' ? null : Date.now()
    intervalId = global.setInterval(function () {
      flush().catch(function () {})
    }, 10000)
    listenersInstalled = true
  }

  function removeListeners() {
    if (!listenersInstalled) return
    global.document.removeEventListener('click', onTaggedClick)
    global.document.removeEventListener('focusin', onFormStart)
    global.document.removeEventListener('submit', onFormSubmit)
    global.document.removeEventListener('visibilitychange', onVisibilityChange)
    global.removeEventListener('pagehide', beacon)
    global.clearInterval(intervalId)
    intervalId = null
    visibleSince = null
    startedForms = {}
    listenersInstalled = false
  }

  var analytics = {
    start: function () {
      if (startPromise) return startPromise
      startPromise = request('/public/storefront/v1/config', {
        method: 'GET',
        credentials: 'omit',
      }).then(function (response) {
        config = response && response.data ? response.data : response
        SITE_ID = (config && config.siteId) || SITE_ID
        started = true
        if (canTrack()) {
          installListeners()
          page()
        }
        return config
      }).catch(function (error) {
        startPromise = null
        throw error
      })
      return startPromise
    },
    page: page,
    track: track,
    setConsent: function (value) {
      if (value !== 'granted' && value !== 'denied') {
        throw new TypeError('Usa "granted" o "denied"')
      }
      var wasAllowed = canTrack()
      writeStorage('consent', value)
      if (value === 'denied') {
        queue = []
        removeStorage('visitor')
        removeStorage('session')
        removeListeners()
      } else if (started) {
        installListeners()
        if (!wasAllowed) page()
      }
      return value
    },
    getConsent: getConsent,
    flush: flush,
    stop: function () {
      recordVisibleTime()
      beacon()
      removeListeners()
      started = false
      startPromise = null
    },
  }

  function ensureFormStyles() {
    if (global.document.getElementById('_ae_form_style')) return
    var style = global.document.createElement('style')
    style.id = '_ae_form_style'
    style.textContent = [
      '._ae-form-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box;width:100%;max-width:520px;color:var(--ae-fg);background:var(--ae-bg)}',
      '._ae-form-wrap *{box-sizing:border-box}',
      '._ae-form-title{font-size:1.25rem;font-weight:700;margin:0 0 6px}',
      '._ae-form-description{font-size:.875rem;color:var(--ae-muted);margin:0 0 20px}',
      '._ae-form-field{margin-bottom:14px}',
      '._ae-form-label{display:block;font-size:.875rem;font-weight:600;margin-bottom:5px}',
      '._ae-form-input{width:100%;padding:10px 12px;border:1px solid var(--ae-border);border-radius:8px;background:var(--ae-input-bg);color:var(--ae-fg);font:inherit}',
      '._ae-form-input:focus{outline:2px solid var(--ae-primary);border-color:var(--ae-primary)}',
      '._ae-form-check{display:flex;align-items:flex-start;gap:8px}',
      '._ae-form-button{width:100%;padding:11px 16px;border:0;border-radius:8px;background:var(--ae-primary);color:var(--ae-primary-fg);font:inherit;font-weight:700;cursor:pointer}',
      '._ae-form-button:disabled{opacity:.55;cursor:not-allowed}',
      '._ae-form-status{font-size:.875rem;margin:12px 0 0}',
      '._ae-form-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}',
    ].join('\n')
    global.document.head.appendChild(style)
  }

  function ensureTurnstileScript() {
    if (global.document.getElementById('_ae_turnstile_script')) return
    var script = global.document.createElement('script')
    script.id = '_ae_turnstile_script'
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    global.document.head.appendChild(script)
  }

  function themeVariables(theme) {
    var dark = (
      theme === 'dark' ||
      (theme === 'auto' && global.matchMedia && global.matchMedia('(prefers-color-scheme:dark)').matches)
    )
    return dark
      ? '--ae-bg:#111827;--ae-fg:#f9fafb;--ae-muted:#9ca3af;--ae-border:#374151;--ae-input-bg:#1f2937;--ae-primary:#6366f1;--ae-primary-fg:#fff'
      : '--ae-bg:#fff;--ae-fg:#111827;--ae-muted:#6b7280;--ae-border:#d1d5db;--ae-input-bg:#fff;--ae-primary:#4f46e5;--ae-primary-fg:#fff'
  }

  function fieldOptions(field) {
    if (Array.isArray(field.options)) return field.options
    if (typeof field.options !== 'string') return []
    try {
      var parsed = JSON.parse(field.options)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      return []
    }
  }

  function renderForm(selector, options) {
    var opts = options || {}
    var target = typeof selector === 'string'
      ? global.document.querySelector(selector)
      : selector
    if (!target) return Promise.reject(new Error('No se encontro el contenedor del formulario'))
    if (!opts.formId) return Promise.reject(new Error('renderForm: formId es requerido'))

    return analytics.start().catch(function () { return null }).then(function () {
      return request(
        '/public/storefront/v1/forms/' + encodeURIComponent(opts.formId),
        { method: 'GET', credentials: 'omit' }
      )
    }).then(function (response) {
      var definition = response && response.data ? response.data : response
      var labels = opts.labels || {}
      ensureFormStyles()
      target.innerHTML = ''

      var wrap = global.document.createElement('div')
      wrap.className = '_ae-form-wrap'
      wrap.setAttribute('style', themeVariables(opts.theme || 'auto'))

      var title = global.document.createElement('h2')
      title.className = '_ae-form-title'
      title.textContent = labels.title || definition.name || 'Formulario'
      wrap.appendChild(title)

      if (definition.description) {
        var description = global.document.createElement('p')
        description.className = '_ae-form-description'
        description.textContent = definition.description
        wrap.appendChild(description)
      }

      var form = global.document.createElement('form')
      form.setAttribute('data-runly-form-id', definition.id)
      form.setAttribute('data-runly-managed', 'true')
      form.setAttribute('novalidate', 'novalidate')
      var controls = []

      ;(definition.fields || []).forEach(function (field, index) {
        var row = global.document.createElement('div')
        row.className = '_ae-form-field'
        var id = '_ae_form_' + definition.id + '_' + index
        var label = global.document.createElement('label')
        label.className = '_ae-form-label'
        label.htmlFor = id
        label.textContent = field.label + (field.required ? ' *' : '')
        var input

        if (field.fieldType === 'textarea') {
          input = global.document.createElement('textarea')
          input.rows = 4
        } else if (field.fieldType === 'select') {
          input = global.document.createElement('select')
          var empty = global.document.createElement('option')
          empty.value = ''
          empty.textContent = field.placeholder || 'Selecciona una opcion'
          input.appendChild(empty)
          fieldOptions(field).forEach(function (option) {
            var optionElement = global.document.createElement('option')
            optionElement.value = typeof option === 'object' ? option.value : option
            optionElement.textContent = typeof option === 'object' ? option.label : option
            input.appendChild(optionElement)
          })
        } else {
          input = global.document.createElement('input')
          input.type = field.fieldType === 'phone' ? 'tel' : (field.fieldType || 'text')
        }

        input.id = id
        input.name = field.name
        input.className = field.fieldType === 'checkbox'
          ? '_ae-form-checkbox'
          : '_ae-form-input'
        input.required = Boolean(field.required)
        input.placeholder = field.placeholder || ''
        if (field.fieldType === 'checkbox') {
          input.type = 'checkbox'
          row.className += ' _ae-form-check'
          row.appendChild(input)
          row.appendChild(label)
        } else {
          row.appendChild(label)
          row.appendChild(input)
        }
        controls.push({ field: field, input: input })
        form.appendChild(row)
      })

      var honeypot = global.document.createElement('input')
      honeypot.type = 'text'
      honeypot.name = '_runly_company_url'
      honeypot.tabIndex = -1
      honeypot.autocomplete = 'off'
      honeypot.className = '_ae-form-honeypot'
      honeypot.setAttribute('aria-hidden', 'true')
      form.appendChild(honeypot)

      if (definition.turnstileRequired && cfg.turnstileSiteKey) {
        var turnstile = global.document.createElement('div')
        turnstile.className = 'cf-turnstile'
        turnstile.setAttribute('data-sitekey', cfg.turnstileSiteKey)
        form.appendChild(turnstile)
        ensureTurnstileScript()
      }

      var button = global.document.createElement('button')
      button.type = 'submit'
      button.className = '_ae-form-button'
      button.textContent = labels.button || definition.submitLabel || 'Enviar'
      form.appendChild(button)

      var status = global.document.createElement('p')
      status.className = '_ae-form-status'
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      form.appendChild(status)

      var formStarted = false
      function markStarted() {
        if (formStarted) return
        formStarted = true
        analytics.track('form_start', { formId: definition.id })
      }
      form.addEventListener('input', markStarted)
      form.addEventListener('change', markStarted)

      form.addEventListener('submit', function (event) {
        event.preventDefault()
        markStarted()
        button.disabled = true
        status.textContent = labels.sending || 'Enviando...'
        var values = {}
        controls.forEach(function (control) {
          values[control.field.name] = control.field.fieldType === 'checkbox'
            ? Boolean(control.input.checked)
            : control.input.value
        })
        var turnstileInput = form.querySelector('[name="cf-turnstile-response"]')
        var body = { values: values, honeypot: honeypot.value || '' }
        if (Number.isInteger(definition.definitionRevision)) body.expectedDefinitionRevision = definition.definitionRevision
        var current = context()
        if (current) {
          body.visitorId = current.visitorId
          body.sessionId = current.sessionId
        }
        if (turnstileInput && turnstileInput.value) {
          body.turnstileToken = turnstileInput.value
        }

        request(
          '/public/storefront/v1/forms/' +
            encodeURIComponent(definition.id) +
            '/submissions',
          {
            method: 'POST',
            headers: { 'Idempotency-Key': randomId() },
            body: JSON.stringify(body),
          }
        ).then(function (submissionResponse) {
          var result = submissionResponse && submissionResponse.data
            ? submissionResponse.data
            : submissionResponse
          analytics.track('form_submit', {
            formId: definition.id,
            submissionId: result && result.submissionId,
          })
          status.textContent =
            labels.success ||
            (result && result.message) ||
            definition.successMessage ||
            'Formulario enviado'
          if (typeof form.reset === 'function') form.reset()
          if (opts.onSuccess) opts.onSuccess(result)
        }).catch(function (error) {
          analytics.track('form_submit_error', {
            formId: definition.id,
            code: error.code || 'UNKNOWN',
          })
          status.textContent = labels.error || error.message || 'No se pudo enviar'
          if (opts.onError) opts.onError(error)
        }).finally(function () {
          button.disabled = false
        })
      })

      wrap.appendChild(form)
      target.appendChild(wrap)
      analytics.track('form_view', { formId: definition.id })

      return {
        form: form,
        destroy: function () {
          target.innerHTML = ''
        },
      }
    })
  }

  global.RunlyERP = global.RunlyERP || {}
  global.RunlyERP.config = Object.assign({}, global.RunlyERP.config || {}, {
    company: COMPANY,
    siteId: SITE_ID,
    analyticsMode: cfg.analyticsMode || 'off',
  })
  global.RunlyERP.analytics = analytics
  global.RunlyERP.renderForm = renderForm
  global.AtlasERP = global.RunlyERP

  if (cfg.analyticsMode && cfg.analyticsMode !== 'off') {
    analytics.start().catch(function () {})
  }
  if (global.dispatchEvent && global.CustomEvent) {
    global.dispatchEvent(new global.CustomEvent('runly:ready'))
    global.dispatchEvent(new global.CustomEvent('atlas:ready'))
  }
})(window)
