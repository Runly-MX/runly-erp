import { useRef } from 'react'
import { Button, Switch } from '@runly/ui'
import { AlertTriangle, Circle, Download, Mic, MicOff, RotateCcw, Trash2, X } from 'lucide-react'

// Panels of Grabar presentación. Rendered inside the player (never portalled): native
// fullscreen only shows the player's own subtree.
export const formatDuration = ms => {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
const panel = 'pointer-events-auto w-full max-w-md rounded-lg bg-white p-4 text-neutral-900 shadow-xl dark:bg-neutral-900 dark:text-neutral-100'

export function RecordSetupPanel({ recording: r, onClose }) {
  const { support } = r
  return (
    <div data-controls role="dialog" aria-label="Grabar presentación" className={panel}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-red-600/10 text-red-600"><Circle className="h-4 w-4 fill-current" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Grabar presentación</p>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            {support.supported ? 'Se graban solo las diapositivas, con sus animaciones y transiciones. Avanza o retrocede como siempre; el video se queda en tu equipo.' : support.reason}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      {support.supported ? (
        <>
          <label className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 dark:border-neutral-700">
            <span className="flex items-center gap-2 text-sm">{r.microphone ? <Mic className="h-4 w-4" aria-hidden /> : <MicOff className="h-4 w-4" aria-hidden />}Narrar con el micrófono</span>
            <Switch checked={r.microphone && support.microphone} disabled={!support.microphone} onCheckedChange={value => { r.setError(''); r.setMicrophone(value) }} aria-label="Narrar con el micrófono" />
          </label>
          {!support.microphone ? <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">Este navegador no da acceso al micrófono: el video se graba sin audio.</p> : null}
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">Formato: {support.type.extension.toUpperCase()}{support.canPause ? '' : ' · este navegador no permite pausar la grabación'}.</p>
        </>
      ) : <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">Para un video sin narración usa Exportar → Video MP4 en el editor.</p>}
      {r.error ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{r.error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        {support.supported ? <Button type="button" className="gap-1.5 bg-red-600 text-white hover:bg-red-700" onClick={r.actions.start}><Circle className="h-3.5 w-3.5 fill-current" aria-hidden />Empezar a grabar</Button> : null}
      </div>
    </div>
  )
}

export function Countdown({ count, onCancel }) {
  return (
    <div data-controls className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/55" role="status" aria-live="assertive">
      <span className="text-8xl font-semibold tabular-nums text-white">{count}</span>
      <span className="sr-only">La grabación empieza en {count}</span>
      <Button type="button" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/15 hover:text-white" onClick={onCancel}>Cancelar</Button>
    </div>
  )
}

export function RecordingResult({ recording: r, title }) {
  const video = useRef(null), { result } = r
  // MediaRecorder WebM files carry no duration: seek to the end once so the player can scrub.
  const fixDuration = () => {
    const element = video.current
    if (!element || Number.isFinite(element.duration)) return
    element.addEventListener('timeupdate', () => { element.currentTime = 0 }, { once: true })
    element.currentTime = 1e9
  }
  const download = () => {
    const link = document.createElement('a'), safe = (title || 'presentacion').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'presentacion'
    link.href = result.url; link.download = `${safe} - grabación.${result.extension}`
    video.current?.parentElement?.appendChild(link)
    link.click(); link.remove()
  }
  return (
    <div data-controls className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
      <div role="dialog" aria-label="Grabación lista" className={`${panel} max-w-2xl`}>
        <p className="font-semibold">Grabación lista</p>
        <p className="mt-0.5 text-sm tabular-nums text-neutral-600 dark:text-neutral-400">{formatDuration(result.duration)} · {result.extension.toUpperCase()} · {megabytes(result.blob.size)}</p>
        <video ref={video} src={result.url} controls playsInline onLoadedMetadata={fixDuration} className="mt-3 max-h-[55dvh] w-full rounded-md bg-black" />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" className="gap-1.5 text-destructive" onClick={r.actions.discard}><Trash2 className="h-4 w-4" aria-hidden />Descartar</Button>
          <Button type="button" variant="outline" className="gap-1.5" onClick={r.actions.again}><RotateCcw className="h-4 w-4" aria-hidden />Grabar de nuevo</Button>
          <Button type="button" className="gap-1.5" onClick={download}><Download className="h-4 w-4" aria-hidden />Descargar</Button>
        </div>
      </div>
    </div>
  )
}
