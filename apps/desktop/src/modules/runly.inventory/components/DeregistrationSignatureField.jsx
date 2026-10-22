import { useState } from 'react'
import { Button, SignaturePad, TextField } from '@runly/ui'
import { CheckCircle2, PenLine, Printer } from 'lucide-react'
import { useSavedSignature } from '../../../hooks/useSavedSignature.js'

const toBase64 = (dataUrl) => String(dataUrl ?? '').replace(/^data:image\/png;base64,/, '')

// Builds the request fields for the acta's signature from the field value.
export function signaturePayload(value) {
  if (value.mode === 'saved') return { signature: { useSaved: true } }
  if (value.mode === 'paper') return { signOnPaper: true }
  if (value.mode === 'draw' && value.dataUrl) return { signature: { pngBase64: toBase64(value.dataUrl) } }
  return null
}

// Who authorizes (title) and how they sign the acta de baja: draw it, apply
// the signature saved in their profile, or sign the printed document.
export function DeregistrationSignatureField({ value, onChange, error }) {
  const saved = useSavedSignature()
  const [padKey, setPadKey] = useState(0)
  const hasSaved = Boolean(saved.signature?.url)
  const set = (patch) => onChange({ ...value, ...patch })
  const modes = [
    { key: 'draw', label: 'Dibujar firma', icon: PenLine },
    ...(hasSaved ? [{ key: 'saved', label: 'Usar mi firma guardada', icon: CheckCircle2 }] : []),
    { key: 'paper', label: 'Firmaré el acta impresa', icon: Printer },
  ]
  return (
    <div className="space-y-3">
      <TextField label="Cargo de quien autoriza" value={value.approverTitle} maxLength={200} placeholder="Ej. Gerente de administración"
        onChange={(e) => set({ approverTitle: e.target.value })} />
      <div className="space-y-2">
        <p className="text-sm font-medium">Firma del acta de baja <span className="text-destructive">*</span></p>
        <div className="flex flex-wrap gap-2">
          {modes.map(({ key, label, icon: Icon }) => (
            <Button key={key} type="button" size="sm" variant={value.mode === key ? 'default' : 'outline'}
              onClick={() => { set({ mode: key }); if (key === 'draw') setPadKey((k) => k + 1) }}>
              <Icon className="mr-1.5 h-3.5 w-3.5" />{label}
            </Button>
          ))}
        </div>
        {value.mode === 'draw' ? <SignaturePad key={padKey} onChange={(dataUrl) => set({ dataUrl })} height={180} /> : null}
        {value.mode === 'saved' ? (
          <div className="mx-auto flex aspect-[5/2] w-full max-w-[420px] items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-2">
            <img src={saved.signature.url} alt="Tu firma guardada" className="h-full w-full object-contain dark:invert" />
          </div>
        ) : null}
        {value.mode === 'paper' ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">El acta se genera con la línea de firma en blanco para firmarla impresa; después puedes adjuntar la versión firmada al activo.</p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
