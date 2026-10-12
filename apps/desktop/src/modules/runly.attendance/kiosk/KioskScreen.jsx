import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Maximize2, Minimize2, Keyboard, QrCode, Nfc, TriangleAlert } from 'lucide-react'
import { useKiosk } from './useKiosk.js'
import { KioskClock } from './components/KioskClock.jsx'
import { PinPad } from './components/PinPad.jsx'
import { QrScanner } from './components/QrScanner.jsx'
import { NfcPanel, nfcSupported } from './components/NfcPanel.jsx'
import { PunchOverlay } from './components/PunchOverlay.jsx'
import { PairingView } from './components/PairingView.jsx'
import { DiagnosticsSheet, StatusPill } from './components/StatusPill.jsx'
import { fullscreenSupported, requestWakeLock, toggleFullscreen } from './lib/feedback.js'
import { registerAttendanceWorker } from './lib/register-sw.js'
import { startNativeNfcLoop } from '../../../native/nfc-loop.js'

// Public offline-first time clock at /app/kiosk/:link. No login, no app shell.
export default function KioskScreen() {
  const { link } = useParams()
  const kiosk = useKiosk(link)
  const [tab, setTab] = useState(null)
  const [diagnostics, setDiagnostics] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    registerAttendanceWorker('/app/kiosk/')
    const previous = document.title
    document.title = 'Kiosko de asistencia'
    return () => { document.title = previous }
  }, [])

  // Inside the Android host, feed NFC cards through the runly:nfc-card event.
  useEffect(() => startNativeNfcLoop(), [])

  useEffect(() => {
    let lock = null
    let cancelled = false
    const acquire = async () => { lock = await requestWakeLock(); if (cancelled) lock?.release?.() }
    acquire()
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      cancelled = true
      lock?.release?.()
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  const tabs = useMemo(() => {
    const list = []
    if (kiosk.kiosk?.allowPin !== false) list.push({ id: 'pin', label: 'Código y PIN', Icon: Keyboard })
    list.push({ id: 'qr', label: 'Código QR', Icon: QrCode })
    if (nfcSupported()) list.push({ id: 'nfc', label: 'Tarjeta', Icon: Nfc })
    return list
  }, [kiosk.kiosk?.allowPin])
  const active = tabs.find((t) => t.id === tab) ?? tabs[0]

  const shell = 'min-h-dvh bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(13,148,136,0.22),transparent_60%)] text-slate-50'

  if (kiosk.phase !== 'ready') {
    return <div className={shell}><PairingView phase={kiosk.phase} pairing={kiosk.pairing} onRetry={kiosk.retryPairing} /></div>
  }

  return (
    <div className={`fixed inset-0 flex flex-col overflow-y-auto overflow-x-hidden ${shell}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="text-sm font-medium text-slate-300">{kiosk.kiosk?.name ?? 'Kiosko'}</p>
        <div className="flex items-center gap-2">
          <StatusPill online={kiosk.online} pending={kiosk.pending} onClick={() => setDiagnostics(true)} />
          {fullscreenSupported() && (
            <button
              type="button"
              onClick={toggleFullscreen}
              className="flex size-10 items-center justify-center rounded-full bg-white/10 text-slate-200 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            >
              {fullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
            </button>
          )}
        </div>
      </header>

      {kiosk.authIssue && (
        <div role="alert" className="mx-4 mb-2 flex items-center gap-3 rounded-2xl bg-red-500/15 px-4 py-3 text-red-100 ring-1 ring-red-400/40 sm:mx-6">
          <TriangleAlert className="size-5 shrink-0" />
          <p className="text-sm">{kiosk.authIssue}. Las checadas se conservan en este dispositivo hasta que se resuelva.</p>
        </div>
      )}

      <main className="flex flex-1 gap-6 px-4 pb-6 sm:px-8 portrait:flex-col landscape:flex-row landscape:items-center">
        <section className="flex flex-1 items-center justify-center py-2">
          <KioskClock siteName={kiosk.kiosk?.siteName} companyName={kiosk.kiosk?.companyName} />
        </section>
        <section className="flex flex-1 flex-col justify-center gap-4 py-2">
          {!kiosk.roster ? (
            <p className="text-center text-lg text-slate-300">Descargando la lista de personal… Conéctate a internet una vez para empezar.</p>
          ) : (
            <>
              {tabs.length > 1 && (
                <div role="tablist" className="mx-auto flex w-full max-w-sm rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10">
                  {tabs.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      role="tab"
                      type="button"
                      aria-selected={active?.id === id}
                      onClick={() => setTab(id)}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${active?.id === id ? 'bg-teal-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>
              )}
              {active?.id === 'pin' && <PinPad onSubmit={kiosk.submitPin} resetKey={kiosk.result?.key} disabled={Boolean(kiosk.result)} />}
              {active?.id === 'qr' && <QrScanner onResult={kiosk.submitQr} paused={Boolean(kiosk.result)} />}
              {active?.id === 'nfc' && <NfcPanel onCard={kiosk.submitCard} />}
            </>
          )}
        </section>
      </main>

      <PunchOverlay result={kiosk.result} onDismiss={kiosk.clearResult} />
      <DiagnosticsSheet
        open={diagnostics}
        onOpenChange={setDiagnostics}
        kiosk={kiosk.kiosk}
        online={kiosk.online}
        pending={kiosk.pending}
        rejected={kiosk.rejectedLog}
        onSync={kiosk.syncNow}
        photos={kiosk.pendingPhotos}
        geoStatus={kiosk.geoStatus}
        notes={kiosk.notes}
      />
    </div>
  )
}
