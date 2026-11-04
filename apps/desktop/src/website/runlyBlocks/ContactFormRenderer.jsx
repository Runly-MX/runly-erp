import { useEffect, useId, useRef, useState } from 'react'

import { getApiUrl } from '../../lib/runtimeConfig.js'

let sdkPromise = null
let turnstilePromise = null

// The form is referenced (fields + submission come from the Runly form) but drawn here with no card, title or colors of
// its own: it inherits the section's font and text color and uses the site's primary color, so it blends into any
// template. Templates can fine-tune it through the rf-* classes.
const FORM_CSS = `
.rf-form{display:grid;gap:14px;width:100%;font:inherit;color:inherit}
.rf-form[data-compact="true"]{display:flex;flex-wrap:wrap;align-items:stretch;gap:10px}
.rf-form[data-compact="true"] .rf-field{flex:1 1 220px}
.rf-form[data-compact="true"] .rf-button{flex:0 0 auto}
.rf-form[data-compact="true"] .rf-status{flex-basis:100%}
.rf-field{display:grid;gap:6px;min-width:0}
.rf-check{display:flex;align-items:flex-start;gap:10px;font-size:.92em}
.rf-label{font-size:.88em;font-weight:600;opacity:.85}
.rf-input{width:100%;min-height:46px;padding:11px 14px;border-radius:12px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);background:color-mix(in srgb,currentColor 6%,transparent);color:inherit;font:inherit;transition:border-color .2s,box-shadow .2s,background .2s;box-sizing:border-box}
.rf-input::placeholder{color:inherit;opacity:.55}
.rf-input:focus{outline:none;border-color:var(--atlas-color-primary,currentColor);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas-color-primary,currentColor) 25%,transparent)}
select.rf-input option{color:#111;background:#fff}
textarea.rf-input{min-height:120px;resize:vertical}
.rf-button{min-height:46px;padding:11px 22px;border:0;border-radius:999px;background:var(--atlas-color-primary,#111);color:#fff;font:inherit;font-weight:700;cursor:pointer;transition:transform .2s,filter .2s,opacity .2s}
.rf-button:hover{transform:translateY(-1px);filter:brightness(1.08)}
.rf-button:disabled{opacity:.6;cursor:progress;transform:none}
.rf-status{margin:0;font-size:.92em}
.rf-status[data-tone="error"]{color:#e5484d}
.rf-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}
.rf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.rf-skeleton{height:46px;border-radius:12px;background:color-mix(in srgb,currentColor 8%,transparent)}
`

function loadStorefrontSdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('El SDK storefront requiere un navegador'))
  }
  if (window.RunlyERP?.getForm) return Promise.resolve(window.RunlyERP)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('runly-storefront-sdk')
    const script = existing ?? document.createElement('script')
    const handleLoad = () => {
      if (window.RunlyERP?.getForm) resolve(window.RunlyERP)
      else reject(new Error('El SDK storefront no expuso getForm'))
    }
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('No se pudo cargar el SDK storefront')),
      { once: true },
    )
    if (!existing) {
      script.id = 'runly-storefront-sdk'
      script.src = `${getApiUrl()}/public/site/runly-sdk.js`
      script.defer = true
      document.head.appendChild(script)
    }
  }).catch((error) => {
    sdkPromise = null
    throw error
  })
  return sdkPromise
}

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  turnstilePromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => { turnstilePromise = null; reject(new Error('turnstile')) }
    document.head.appendChild(script)
  })
  return turnstilePromise
}

function fieldOptions(field) {
  if (Array.isArray(field.options)) return field.options
  try { const parsed = JSON.parse(field.options ?? '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

function Field({ field, id, compact }) {
  const common = { id, name: field.name, required: Boolean(field.required), placeholder: field.placeholder || (compact ? field.label : ''), className: 'rf-input' }
  if (field.fieldType === 'checkbox') {
    return (
      <label className="rf-field rf-check" htmlFor={id}>
        <input id={id} name={field.name} type="checkbox" required={Boolean(field.required)} />
        <span>{field.label}{field.required ? ' *' : ''}</span>
      </label>
    )
  }
  const control = field.fieldType === 'textarea' ? <textarea {...common} rows={4} />
    : field.fieldType === 'select' ? (
      <select {...common} defaultValue="">
        <option value="">{field.placeholder || 'Selecciona una opción'}</option>
        {fieldOptions(field).map((option) => {
          const value = typeof option === 'object' ? option.value : option
          return <option key={value} value={value}>{typeof option === 'object' ? option.label : option}</option>
        })}
      </select>
    ) : <input {...common} type={field.fieldType === 'phone' ? 'tel' : (field.fieldType || 'text')} autoComplete={field.fieldType === 'email' ? 'email' : undefined} />
  return (
    <div className="rf-field">
      <label className={compact ? 'rf-sr' : 'rf-label'} htmlFor={id}>{field.label}{field.required ? ' *' : ''}</label>
      {control}
    </div>
  )
}

export default function ContactFormRenderer({
  formId,
  successMessage,
  buttonLabel,
}) {
  const uid = useId()
  const [definition, setDefinition] = useState(null)
  const [failed, setFailed] = useState(false)
  const [status, setStatus] = useState(null)
  const [sending, setSending] = useState(false)
  const turnstileRef = useRef(null)
  const tokenRef = useRef('')

  useEffect(() => {
    if (!formId) return undefined
    let cancelled = false
    setDefinition(null); setFailed(false)
    loadStorefrontSdk()
      .then((sdk) => sdk.getForm(formId))
      .then((loaded) => { if (!cancelled) setDefinition(loaded) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [formId])

  const siteKey = typeof window !== 'undefined' ? (window.RUNLY_CONFIG ?? window.ATLAS_CONFIG)?.turnstileSiteKey : null
  const needsChallenge = Boolean(definition?.turnstileRequired && siteKey)
  useEffect(() => {
    if (!needsChallenge || !turnstileRef.current) return undefined
    let widget = null
    loadTurnstile().then((turnstile) => {
      if (!turnstileRef.current) return
      widget = turnstile.render(turnstileRef.current, { sitekey: siteKey, callback: (token) => { tokenRef.current = token } })
    }).catch(() => {})
    return () => { if (widget != null) window.turnstile?.remove?.(widget) }
  }, [needsChallenge, siteKey])

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = {}
    for (const field of definition.fields ?? []) {
      const input = form.elements.namedItem(field.name)
      values[field.name] = field.fieldType === 'checkbox' ? Boolean(input?.checked) : (input?.value ?? '')
    }
    setSending(true); setStatus({ tone: 'info', text: 'Enviando…' })
    try {
      const result = await window.RunlyERP.submitForm(definition, values, { honeypot: form.elements.namedItem('_runly_company_url')?.value, turnstileToken: tokenRef.current })
      setStatus({ tone: 'success', text: successMessage || result?.message || definition.successMessage || 'Formulario enviado' })
      form.reset()
      if (needsChallenge) { tokenRef.current = ''; window.turnstile?.reset?.() }
    } catch (error) {
      setStatus({ tone: 'error', text: error?.message || 'No se pudo enviar' })
    } finally { setSending(false) }
  }

  if (!formId) {
    return (
      <div style={{ padding: '24px', border: '1px dashed currentColor', borderRadius: '12px', textAlign: 'center', opacity: 0.6 }}>
        <p style={{ fontSize: '14px', margin: 0 }}>Configura el ID del formulario en las propiedades</p>
      </div>
    )
  }

  const fields = definition?.fields ?? []
  // A single field (newsletter) reads better as one row: field and button side by side.
  const compact = fields.length === 1 && fields[0].fieldType !== 'checkbox'
  return (
    <div style={{ width: '100%' }}>
      <style>{FORM_CSS}</style>
      {failed ? <p role="alert" className="rf-status" data-tone="error">No se pudo cargar el formulario configurado.</p>
        : !definition ? <div className="rf-skeleton" aria-label="Cargando formulario" />
        : (
          <form className="rf-form" data-compact={String(compact)} data-runly-form-id={definition.id} noValidate={false} onSubmit={submit}>
            {fields.map((field, index) => <Field key={field.name ?? index} field={field} id={`${uid}-${index}`} compact={compact} />)}
            <input type="text" name="_runly_company_url" tabIndex={-1} autoComplete="off" aria-hidden="true" className="rf-honeypot" />
            {needsChallenge && <div ref={turnstileRef} style={{ flexBasis: '100%' }} />}
            <button type="submit" className="rf-button" disabled={sending}>{buttonLabel || definition.submitLabel || 'Enviar'}</button>
            <p className="rf-status" role="status" aria-live="polite" data-tone={status?.tone}>{status?.text}</p>
          </form>
        )}
    </div>
  )
}
