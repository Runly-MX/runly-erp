import { useCallback, useEffect, useRef, useState } from 'react'
import { createPresentationRecorder, drawStage, pickRecordingType, recordingSize, recordingSupport, requestMicrophone } from '../../lib/presentation-recorder.js'

const COUNTDOWN = 3
const denied = error => ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error?.name)

// Grabar presentación for one player session: setup → countdown → recording ⇄ paused →
// stopping → done. The compositor reads the player's layers on every frame, so the video
// shows exactly what the stage shows, on the same slide clock.
export function usePresentationRecording({ player }) {
  const [support] = useState(() => recordingSupport())
  const [phase, setPhase] = useState('idle'), [microphone, setMicrophone] = useState(true)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [count, setCount] = useState(0)
  const [elapsed, setElapsed] = useState(0), [result, setResult] = useState(null)
  const session = useRef(null), images = useRef(new Map()), latest = useRef(player), timers = useRef([])
  latest.current = player

  const sourceOf = useCallback(layer => {
    if (layer.kind === 'live') return latest.current.live.current?.frame() ?? null
    if (layer.kind === 'canvas') return layer.canvas
    let image = images.current.get(layer.url)
    if (!image) { image = new Image(); image.src = layer.url; images.current.set(layer.url, image) }
    return image.complete && image.naturalWidth ? image : null
  }, [])

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const release = useCallback(() => {
    clearTimers()
    session.current?.recorder?.cancel()
    for (const track of session.current?.microphone?.getTracks() ?? []) track.stop()
    session.current = null
  }, [])

  async function start() {
    setError(''); setNotice('')
    let mic = null
    if (microphone && support.microphone) {
      try { mic = await requestMicrophone() } catch (failure) {
        setError(denied(failure) ? 'No se dio permiso para usar el micrófono. Permítelo en el navegador o graba sin audio.' : 'No se encontró un micrófono disponible. Puedes grabar sin audio.')
        return
      }
    }
    const type = pickRecordingType(Boolean(mic))
    if (!type) { for (const track of mic?.getTracks() ?? []) track.stop(); setError('Este navegador no puede grabar video con audio. Graba sin micrófono.'); return }
    session.current = { microphone: mic, type }
    setPhase('countdown'); setCount(COUNTDOWN)
    for (let step = 1; step <= COUNTDOWN; step++) timers.current.push(setTimeout(() => (step < COUNTDOWN ? setCount(COUNTDOWN - step) : begin()), step * 1000))
  }

  function begin() {
    const current = session.current
    if (!current) return
    const { pages, index } = latest.current, { width, height } = recordingSize(pages[index].page)
    try {
      current.recorder = createPresentationRecorder({ width, height, microphone: current.microphone, type: current.type,
        draw: ctx => drawStage(ctx, { width, height, layers: latest.current.layers, pages: latest.current.pages, sourceOf }) })
      // The slide on screen starts over so its animations are recorded from the beginning.
      latest.current.actions.replay()
      current.recorder.start()
      setElapsed(0); setPhase('recording')
    } catch (failure) {
      release(); setPhase('idle'); setError(`No se pudo iniciar la grabación: ${failure.message}`)
    }
  }

  const pause = useCallback(reason => {
    const recorder = session.current?.recorder
    if (!recorder || recorder.state !== 'recording') return
    if (support.canPause) recorder.pause()
    latest.current.actions.freeze(true)
    setPhase('paused'); setNotice(reason ?? '')
  }, [support.canPause])
  function resume() {
    const recorder = session.current?.recorder
    if (!recorder) return
    latest.current.actions.freeze(false)
    if (support.canPause) recorder.resume()
    setPhase('recording'); setNotice('')
  }

  async function stop() {
    const recorder = session.current?.recorder
    if (!recorder) return
    setPhase('stopping')
    latest.current.actions.freeze(false)
    try {
      const file = await recorder.stop()
      setResult({ ...file, url: URL.createObjectURL(file.blob) })
      setPhase('done')
    } catch (failure) { setError(failure.message); setPhase('idle') }
    finally { for (const track of session.current?.microphone?.getTracks() ?? []) track.stop(); session.current = null }
  }

  function discard() {
    if (result) URL.revokeObjectURL(result.url)
    setResult(null); setPhase('idle'); setNotice('')
  }

  // Duration readout while recording.
  useEffect(() => {
    if (phase !== 'recording') return undefined
    const timer = setInterval(() => setElapsed(session.current?.recorder?.elapsed() ?? 0), 250)
    return () => clearInterval(timer)
  }, [phase])
  // A hidden tab stops animation frames: pause instead of recording a frozen picture.
  useEffect(() => {
    if (phase !== 'recording') return undefined
    const onVisibility = () => { if (document.hidden) pause('La grabación se pausó porque cambiaste de pestaña.') }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [phase, pause])
  useEffect(() => () => {
    release()
    for (const image of images.current.values()) image.src = ''
  }, [release])
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url) }, [result])

  return {
    support, phase, microphone, setMicrophone, error, setError, notice, count, elapsed, result,
    active: ['countdown', 'recording', 'paused', 'stopping'].includes(phase),
    actions: {
      setup: () => { setError(''); setPhase('setup') },
      close: () => { setError(''); setPhase('idle') },
      cancelCountdown: () => { release(); setPhase('idle') },
      start, pause: () => pause(), resume, stop, discard,
      again: () => { discard(); setPhase('setup') },
    },
  }
}
