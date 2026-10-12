import { useCallback, useEffect, useRef, useState } from 'react'
import { Delete, CornerDownLeft, ArrowLeft } from 'lucide-react'
import { haptic } from '../lib/feedback.js'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
const keyClass = 'flex items-center justify-center rounded-3xl bg-white/[0.07] text-white text-[clamp(1.5rem,4.2vmin,2.6rem)] font-medium ring-1 ring-white/10 transition active:scale-95 active:bg-white/20 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 select-none touch-manipulation h-[clamp(3.4rem,9.5vmin,5.6rem)]'

// Two-step entry: employee code, then PIN. Verification happens in the parent
// (offline, against the cached roster).
export function PinPad({ onSubmit, resetKey, disabled }) {
  const [step, setStep] = useState('code')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const busy = useRef(false)
  const value = step === 'code' ? code : pin
  const setValue = step === 'code' ? setCode : setPin

  useEffect(() => { setStep('code'); setCode(''); setPin('') }, [resetKey])

  const press = useCallback((digit) => {
    haptic(10)
    setValue((v) => (v.length >= 12 ? v : v + digit))
  }, [setValue])
  const erase = useCallback(() => { haptic(10); setValue((v) => v.slice(0, -1)) }, [setValue])

  const confirm = useCallback(async () => {
    if (busy.current || disabled || !value) return
    haptic(20)
    if (step === 'code') { setStep('pin'); return }
    busy.current = true
    try { await onSubmit(code, pin) } finally { busy.current = false; setStep('code'); setCode(''); setPin('') }
  }, [step, value, code, pin, onSubmit, disabled])

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Enter') { e.preventDefault(); confirm() }
      else if (e.key === 'Backspace') erase()
      else if (/^[0-9]$/.test(e.key) || (step === 'code' && /^[a-zA-Z0-9-]$/.test(e.key))) press(e.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm, erase, press, step])

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-teal-300">
          {step === 'code' ? 'Paso 1 · Tu código de empleado' : 'Paso 2 · Tu PIN'}
        </p>
        <div
          className="mt-2 flex h-[clamp(3.2rem,8vmin,4.6rem)] items-center justify-center rounded-2xl bg-black/40 px-4 text-[clamp(1.6rem,4.6vmin,2.8rem)] tracking-[0.25em] text-white ring-1 ring-white/10"
          aria-live="polite"
        >
          {value ? (step === 'pin' ? '•'.repeat(value.length) : value) : <span className="text-base tracking-normal text-slate-500">{step === 'code' ? 'Escribe tu código' : 'Escribe tu PIN'}</span>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)} disabled={disabled}>{k}</button>
        ))}
        <button type="button" className={`${keyClass} text-slate-300`} onClick={step === 'pin' && !pin ? () => setStep('code') : erase} aria-label={step === 'pin' && !pin ? 'Volver al código' : 'Borrar'}>
          {step === 'pin' && !pin ? <ArrowLeft className="size-7" /> : <Delete className="size-7" />}
        </button>
        <button type="button" className={keyClass} onClick={() => press('0')} disabled={disabled}>0</button>
        <button
          type="button"
          className={`${keyClass} !bg-teal-600 !ring-teal-400/40 hover:!bg-teal-500 disabled:!bg-slate-700 disabled:opacity-60`}
          onClick={confirm}
          disabled={disabled || !value}
          aria-label={step === 'code' ? 'Continuar' : 'Registrar checada'}
        >
          <CornerDownLeft className="size-7" />
        </button>
      </div>
    </div>
  )
}
