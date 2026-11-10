import { useRef, useState } from 'react'
import { Camera, ScanBarcode } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@runly/ui'
import { toast } from 'sonner'
import { appendSerial, parseSerials } from '../lib/capture.js'
import { normalizeScanCode } from '../lib/scan-session.js'
import { ScanCamera } from './scan/ScanCamera.jsx'

// Adds serials to the bulk list from a handheld / USB / Bluetooth reader (types
// the code and presses Enter or Tab, so the field commits on either) or from the
// device camera. Each read goes through appendSerial: it adds the configured
// separator and ignores a serial that is already in the list.
export function SerialScanner({ serialsText, setSerialsText, separator, disabled }) {
  const inputRef = useRef(null)
  const textRef = useRef(serialsText)
  textRef.current = serialsText
  const [value, setValue] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [paused, setPaused] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Reads the latest text from a ref: the camera can fire several reads between renders.
  function add(raw) {
    const code = normalizeScanCode(raw)
    if (!code) return null
    const result = appendSerial(textRef.current, code, separator)
    if (result.added) {
      textRef.current = result.text
      setSerialsText(result.text)
    }
    return { code, added: result.added }
  }

  function commit() {
    const read = add(value)
    setValue('')
    if (read && !read.added) toast.message(`«${read.code}» ya está en la lista.`)
    inputRef.current?.focus()
  }

  function onCameraRead(text) {
    const read = add(text)
    if (!read) return
    setFeedback(read.added
      ? { tone: 'ok', title: 'Serie agregada', detail: read.code }
      : { tone: 'duplicate', title: 'Ya estaba en la lista', detail: read.code })
  }

  const count = parseSerials(serialsText).serials.length

  return (
    <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary" aria-hidden="true">
          <ScanBarcode className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">Escanear series</p>
          <p className="text-xs leading-snug text-[hsl(var(--muted-foreground))]">Con lector USB o Bluetooth, o con la cámara. Cada lectura se agrega a la lista.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === 'Tab' && value.trim())) { e.preventDefault(); commit() }
          }}
          placeholder="Escanea o escribe una serie y presiona Enter"
          aria-label="Escanear serie con lector"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-11 min-w-0 flex-1 rounded-md font-mono text-base"
        />
        <Button type="button" variant="outline" className="h-11 shrink-0" disabled={disabled} onClick={() => { setFeedback(null); setPaused(false); setCameraOpen(true) }}>
          <Camera className="mr-2 h-4 w-4" />Usar cámara
        </Button>
      </div>

      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent size="md">
          <DialogHeader icon={Camera}>
            <DialogTitle>Escanear series con la cámara</DialogTitle>
            <DialogDescription>Apunta a cada código; se agregan solos a la lista. Cierra cuando termines.</DialogDescription>
          </DialogHeader>
          <ScanCamera
            className="aspect-4/3 w-full rounded-xl"
            paused={paused}
            onPausedChange={setPaused}
            onRead={onCameraRead}
            tone={feedback?.tone ?? null}
            feedback={feedback}
            muted
            onMutedChange={() => {}}
          />
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]" aria-live="polite">
            <span className="font-medium tabular-nums text-[hsl(var(--foreground))]">{count}</span> {count === 1 ? 'serie en la lista' : 'series en la lista'}
          </p>
          <DialogFooter>
            <Button type="button" onClick={() => setCameraOpen(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
