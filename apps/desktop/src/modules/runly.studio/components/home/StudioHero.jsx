import { ChipTabs, SearchInput } from '@runly/ui'
import { PenTool } from 'lucide-react'
import { FORMAT_CATEGORIES } from '../../lib/formats.js'

const GLOW = {
  backgroundImage: 'radial-gradient(55% 90% at 88% 0%, rgb(217 70 239 / 0.20), transparent 62%), radial-gradient(45% 80% at 0% 100%, rgb(124 58 237 / 0.16), transparent 60%), radial-gradient(30% 50% at 50% 120%, rgb(14 165 233 / 0.10), transparent 70%)',
}

export function StudioHero({ query, onQuery, category, onCategory }) {
  return (
    <section aria-labelledby="studio-hero-title" className="relative overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-8 sm:px-10 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={GLOW} />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1 text-xs font-semibold text-fuchsia-700 dark:text-fuchsia-300">
          <PenTool className="h-3.5 w-3.5" aria-hidden />Studio
        </span>
        <h1 id="studio-hero-title" className="mt-4 text-balance text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] sm:text-5xl">
          ¿Qué vas a <span className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-500 bg-clip-text text-transparent">diseñar</span> hoy?
        </h1>
        <p className="mt-3 max-w-xl text-pretty text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
          Publicaciones, flyers, presentaciones y piezas de marca con las imágenes que ya tienes en Runly.
        </p>
        <SearchInput
          value={query} onChange={event => onQuery(event.target.value)} onClear={() => onQuery('')}
          placeholder="Buscar en tus diseños" aria-label="Buscar en tus diseños" maxLength={80}
          className="mt-6 w-full max-w-xl"
        />
      </div>
      <div className="relative mx-auto mt-6 max-w-4xl">
        <ChipTabs tabs={FORMAT_CATEGORIES} value={category} onChange={onCategory} tone="brand" ariaLabel="Tipos de formato" showDescription={false} />
      </div>
    </section>
  )
}
