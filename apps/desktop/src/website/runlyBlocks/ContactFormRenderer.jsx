import { useEffect, useRef } from 'react'

import { getApiUrl } from '../../lib/runtimeConfig.js'

let sdkPromise = null

// A form with a single field (newsletter) reads better as one inline row: field and button side by side.
const COMPACT_CSS = `[data-compact="true"] form{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}[data-compact="true"] ._ae-form-field{flex:1 1 220px;margin:0}[data-compact="true"] ._ae-form-button{flex:0 0 auto;min-height:44px}[data-compact="true"] ._ae-form-status{flex-basis:100%;margin:0}`

function loadStorefrontSdk() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('El SDK storefront requiere un navegador'))
  }
  if (window.RunlyERP?.renderForm) return Promise.resolve(window.RunlyERP)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('runly-storefront-sdk')
    const script = existing ?? document.createElement('script')
    const handleLoad = () => {
      if (window.RunlyERP?.renderForm) resolve(window.RunlyERP)
      else reject(new Error('El SDK storefront no expuso renderForm'))
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

export default function ContactFormRenderer({
  formId,
  successMessage,
  buttonLabel,
}) {
  const targetRef = useRef(null)
  const loadingRef = useRef(null)
  const errorRef = useRef(null)

  useEffect(() => {
    if (!formId || !targetRef.current) return undefined
    let cancelled = false
    let controller = null
    if (loadingRef.current) loadingRef.current.style.display = 'block'
    if (errorRef.current) errorRef.current.style.display = 'none'

    loadStorefrontSdk()
      .then((sdk) =>
        sdk.renderForm(targetRef.current, {
          formId,
          theme: 'auto',
          labels: {
            button: buttonLabel,
            success: successMessage,
          },
        }),
      )
      .then((mounted) => {
        if (cancelled) {
          mounted?.destroy?.()
          return
        }
        controller = mounted
        targetRef.current?.setAttribute('data-compact', String(targetRef.current.querySelectorAll('._ae-form-field').length === 1))
        if (loadingRef.current) loadingRef.current.style.display = 'none'
      })
      .catch(() => {
        if (cancelled) return
        if (loadingRef.current) loadingRef.current.style.display = 'none'
        if (errorRef.current) errorRef.current.style.display = 'block'
      })

    return () => {
      cancelled = true
      controller?.destroy?.()
    }
  }, [buttonLabel, formId, successMessage])

  if (!formId) {
    return (
      <div style={{ padding: '24px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>
          Configura el ID del formulario en las propiedades
        </p>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: '520px' }}>
      <p ref={loadingRef} style={{ color: '#64748b', fontSize: '14px' }}>
        Cargando formulario...
      </p>
      <p
        ref={errorRef}
        role="alert"
        style={{ color: '#dc2626', display: 'none', fontSize: '14px' }}
      >
        No se pudo cargar el formulario configurado.
      </p>
      <style>{COMPACT_CSS}</style>
      <div ref={targetRef} />
    </div>
  )
}
