import { useEffect, useRef, useState } from 'react'
import { Nfc } from 'lucide-react'
import { Button } from '@runly/ui'
import { normalizeUid } from '../lib/punch-logic.js'

export const nfcSupported = () => typeof window !== 'undefined' && 'NDEFReader' in window

// Web NFC reader. Android shells can also feed cards through the
// `runly:nfc-card` window event, handled by the kiosk hook.
export function NfcPanel({ onCard }) {
  const [state, setState] = useState('idle') // idle | scanning | error
  const abortRef = useRef(null)
  const handlerRef = useRef(onCard)
  useEffect(() => { handlerRef.current = onCard }, [onCard])
  useEffect(() => () => abortRef.current?.abort(), [])

  const start = async () => {
    try {
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      const reader = new window.NDEFReader()
      reader.onreading = (event) => handlerRef.current(normalizeUid(event.serialNumber))
      reader.onreadingerror = () => setState('error')
      await reader.scan({ signal: abortRef.current.signal })
      setState('scanning')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 py-6 text-center">
      <div className="relative flex size-44 items-center justify-center">
        {state === 'scanning' && <span className="absolute inset-0 animate-ping rounded-full bg-teal-500/20" />}
        <span className="relative flex size-36 items-center justify-center rounded-full bg-teal-600/20 ring-2 ring-teal-400/60">
          <Nfc className="size-16 text-teal-300" />
        </span>
      </div>
      {state === 'scanning' ? (
        <p className="text-xl text-white">Acerca tu tarjeta al lector</p>
      ) : (
        <>
          <p className="text-slate-300">{state === 'error' ? 'No se pudo activar el lector NFC. Revisa el permiso e inténtalo de nuevo.' : 'Activa el lector para checar con tarjeta.'}</p>
          <Button size="lg" className="bg-teal-600 text-white hover:bg-teal-500" onClick={start}>Activar lector NFC</Button>
        </>
      )}
    </div>
  )
}
