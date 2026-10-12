import { useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { Button, Input } from '@runly/ui'
import { kioskApi } from '../../kiosk/lib/kiosk-api.js'
import { deviceLabel } from '../../kiosk/lib/feedback.js'
import { InstallButton } from './InstallButton.jsx'
import { generatePhoneKey } from '../lib/phone-key.js'
import { phoneStore } from '../lib/phone-store.js'

const inputClass = 'h-14 rounded-2xl border-white/15 bg-white/[0.07] px-4 text-lg text-white placeholder:text-slate-500'

export function EnrollForm({ initialCode, onEnrolled, notice, onDismissNotice }) {
  const [enrollCode, setEnrollCode] = useState(initialCode)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (!globalThis.crypto?.subtle) throw new Error('Este navegador no permite crear llaves seguras. Abre la página con HTTPS.')
      const { privateKey, publicJwk } = await generatePhoneKey()
      const data = await kioskApi.enroll({ enrollCode: enrollCode.trim(), code: code.trim(), publicKey: publicJwk, label: deviceLabel() })
      const identity = { personId: data.personId, name: data.name, code: data.code, privateKey, publicJwk, enrolledAt: new Date().toISOString() }
      await phoneStore.save(identity)
      onEnrolled(identity)
    } catch (e) {
      setError(e.status === 0 ? 'Necesitas conexión para activar tu teléfono.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col gap-5">
      {notice ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-amber-400/15 p-4 text-sm text-amber-50 ring-1 ring-amber-300/40">
          <p className="min-w-0 flex-1">{notice}</p>
          <button type="button" onClick={onDismissNotice} aria-label="Cerrar aviso" className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-amber-100 hover:bg-white/10"><X className="size-4" /></button>
        </div>
      ) : null}
      <div className="text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-teal-600/20 text-teal-300 ring-1 ring-teal-400/40"><KeyRound className="size-8" /></span>
        <h1 className="mt-4 text-2xl font-semibold text-white">Activa tu Checador</h1>
        <p className="mt-2 text-slate-300">Usa el código de invitación que te dio tu administrador y tu código de empleado.</p>
      </div>
      <label className="block text-sm font-medium text-slate-300">Código de invitación
        <Input className={`mt-1.5 ${inputClass} uppercase tracking-widest`} value={enrollCode} onChange={(e) => setEnrollCode(e.target.value)} autoCapitalize="characters" autoComplete="off" required />
      </label>
      <label className="block text-sm font-medium text-slate-300">Código de empleado
        <Input className={`mt-1.5 ${inputClass}`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-100 ring-1 ring-red-400/40">{error}</p>}
      <Button type="submit" size="lg" loading={busy} className="h-14 rounded-2xl bg-teal-600 text-lg text-white hover:bg-teal-500">Activar este teléfono</Button>
      <InstallButton className="self-center" />
    </form>
  )
}
