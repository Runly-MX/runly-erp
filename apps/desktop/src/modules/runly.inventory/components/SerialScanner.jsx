import { useRef, useState } from 'react'
import { Camera, ScanBarcode } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input } from '@runly/ui'
import { toast } from 'sonner'
import { appendSerial } from '../lib/capture.js'
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

  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <Input
          ref={inputRef}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === 'Tab' && value.trim())) { e.preventDefault(); commit() }
          }}
          placeholder="Escanea con lector o escribe una serie y presiona Enter"
          aria-label="Escanear serie con lector"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-10 pl-9"
        />
      </div>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => { setFeedback(null); setPaused(false); setCameraOpen(true) }}>
        <Camera className="mr-1.5 h-4 w-4" />Cámara
      </Button>

      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Escanear series con la cámara</DialogTitle>
            <DialogDescription>Apunta a cada código; se agregan solas a la lista. Cierra cuando termines.</DialogDescription>
          </DialogHeader>
          <ScanCamera
            className="aspect-4/3 w-full"
            paused={paused}
            onPausedChange={setPaused}
            onRead={onCameraRead}
            tone={feedback?.tone ?? null}
            feedback={feedback}
            muted
            onMutedChange={() => {}}
          />
          <div className="flex justify-end">
            <Button type="button" onClick={() => setCameraOpen(false)}>Listo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
