import { useCallback, useEffect, useState } from 'react'

const MESSAGES = {
  2: 'No se pudo determinar tu ubicación. Revisa que la ubicación del dispositivo esté encendida.',
  3: 'La ubicación tardó demasiado. Intenta de nuevo.',
}

// Device position with the browser permission state. A denied permission can't
// be re-prompted by code, so `permission` drives the "how to re-enable" help;
// it updates live (Permissions API) when the user allows it again in settings.
// permission: 'granted' | 'prompt' | 'denied' | 'insecure' | 'unsupported' | null (unknown)
export function useDeviceLocation() {
  const [permission, setPermission] = useState(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported'
    if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure'
    return null
  })
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (permission === 'unsupported' || permission === 'insecure' || !navigator.permissions?.query) return undefined
    let status = null
    let cancelled = false
    const sync = () => { if (!cancelled && status) setPermission(status.state) }
    navigator.permissions.query({ name: 'geolocation' }).then((s) => { status = s; sync(); s.addEventListener?.('change', sync) }).catch(() => {})
    return () => { cancelled = true; status?.removeEventListener?.('change', sync) }
    // Only on mount: the change listener keeps it current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const locate = useCallback(() => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    setLocating(true); setMessage('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false); setPermission('granted')
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy })
      },
      (err) => {
        setLocating(false)
        if (err.code === 1) setPermission('denied')
        else setMessage(MESSAGES[err.code] ?? MESSAGES[2])
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    )
  }), [])

  return { permission, locating, message, locate }
}
