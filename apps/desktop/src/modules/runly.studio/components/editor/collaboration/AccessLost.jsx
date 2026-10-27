import { Button } from '@runly/ui'
import { ArrowLeft, Download, ShieldOff } from 'lucide-react'
import { HeroParticles } from '../../home/HeroParticles.jsx'
import { LostAstronaut } from './LostAstronaut.jsx'

// Shown when the server stops authorising this person (access revoked or the
// design deleted). Unsent changes stay in this browser; nothing else is implied.
// Same look as the Studio home hero: frosted card over the animated backdrop.
export function AccessLost({ onBack, preserved, onDownload, copyFailed }) {
  return (
    <div role="alert" className="h-full overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
        <section aria-labelledby="studio-lost-title" className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-8 sm:px-10 sm:py-10">
          <HeroParticles className="pointer-events-none absolute inset-0 h-full w-full" />
          <div className="relative mx-auto flex max-w-xl flex-col items-center text-center">
            <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#150c33] via-[#22124d] to-[#101a45] ring-1 ring-white/10 shadow-[0_24px_60px_-24px_rgb(124_58_237/0.6)]">
              <LostAstronaut className="block h-auto w-full" />
            </div>
            <span className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
              <ShieldOff className="h-3.5 w-3.5" aria-hidden />Studio
            </span>
            <h1 id="studio-lost-title" className="mt-3 text-balance text-2xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-4xl">
              Ya no tienes <span className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-500 bg-clip-text text-transparent">acceso</span> a este diseño
            </h1>
            <p className="mt-3 max-w-md text-pretty text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
              Parece que este diseño salió de órbita: dejó de estar disponible o tus permisos cambiaron. {copyFailed ? 'No se pudo guardar la copia en este navegador. Descarga el borrador antes de salir.' : preserved ? 'Los cambios que no llegaron al servidor se conservan en este navegador.' : 'No quedaron cambios sin enviar.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a mis diseños</Button>
              {onDownload ? <Button variant="outline" onClick={onDownload} className="gap-1.5 border-white/80 bg-white/45 backdrop-blur-md dark:border-[hsl(var(--input))] dark:bg-transparent"><Download className="h-4 w-4" aria-hidden />Descargar borrador local</Button> : null}
            </div>
            {onDownload ? <p className="mt-3 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">Guarda el documento en JSON, sin originales de imágenes. No recupera el acceso al diseño.</p> : null}
          </div>
        </section>
      </div>
    </div>
  )
}
