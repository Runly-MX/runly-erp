import { useEffect, useRef, useState } from 'react'
import { Button, SearchInput, SegmentedControl } from '@runly/ui'
import { ArrowRight } from 'lucide-react'
import { StudioHero } from './StudioHero.jsx'
import { FormatGrid } from './FormatGrid.jsx'
import { TemplateGrid } from './TemplateGrid.jsx'
import { DesignsList, useHasDesigns } from './DesignsList.jsx'
import { StudioHomeSidebar, StudioHomeTabs } from './StudioHomeNav.jsx'
import { FadeSwap } from '../editor/SidePanel.jsx'
import { StudioPageDialog } from '../StudioPageDialog.jsx'

const SHARED = [{ value: 'all', label: 'Todos' }, { value: 'mine', label: 'Míos' }, { value: 'shared', label: 'Compartidos' }]

function SectionTitle({ id, as: Heading = 'h2', title, description, children }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <Heading id={id} className={Heading === 'h1' ? 'text-2xl font-bold tracking-tight sm:text-3xl' : 'text-lg font-semibold tracking-tight sm:text-xl'}>{title}</Heading>
        {description ? <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}

function SeeAll({ label, onClick }) {
  return <Button variant="ghost" size="sm" onClick={onClick} className="self-start gap-1.5 text-fuchsia-700 hover:text-fuchsia-800 sm:self-auto dark:text-fuchsia-300">{label}<ArrowRight /></Button>
}

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer) }, [value, delay])
  return debounced
}

// Three views (URL ?view=): Inicio (overview), Mis diseños (full list) and
// Plantillas (full catalog). Desktop uses a side nav, phones sticky top tabs.
export function StudioHome({ token, scopeKey, creating, onCreate, onOpen, view = 'home', onView }) {
  const [heroQuery, setHeroQuery] = useState(''), [category, setCategory] = useState('all')
  const [designQuery, setDesignQuery] = useState(''), [shared, setShared] = useState('all'), [sizeOpen, setSizeOpen] = useState(false)
  const heroQ = useDebounced(heroQuery.trim()), designQ = useDebounced(designQuery.trim())
  const hasDesigns = useHasDesigns({ token, scopeKey })
  const top = useRef(null)
  // Switching views starts at the top, like a page change.
  const changeView = next => { onView(next); top.current?.scrollIntoView({ block: 'start' }) }
  const list = props => <DesignsList token={token} scopeKey={scopeKey} creating={creating} onCreate={onCreate} onOpen={onOpen} {...props} />
  const createFormat = format => onCreate('format', format)
  const views = {
    home: (
      <div className="space-y-10">
        <StudioHero query={heroQuery} onQuery={setHeroQuery} category={category} onCategory={setCategory} />
        {heroQ ? (
          <section aria-labelledby="studio-search-title">
            <SectionTitle id="studio-search-title" title={`Resultados para «${heroQ}»`} />
            {list({ q: heroQ, onClearSearch: () => setHeroQuery('') })}
          </section>
        ) : (
          <>
            <section aria-labelledby="studio-formats-title">
              <SectionTitle id="studio-formats-title" title="Empieza con un formato" description="Un lienzo con la medida justa, listo para crear." />
              <FormatGrid category={category} creating={creating} onCreate={createFormat} onCustom={() => setSizeOpen(true)} />
            </section>
            {hasDesigns ? (
              <section aria-labelledby="studio-recent-title">
                <SectionTitle id="studio-recent-title" title="Recientes" description="Continúa donde lo dejaste.">
                  <SeeAll label="Ver todos" onClick={() => changeView('designs')} />
                </SectionTitle>
                {list({ limit: 4 })}
              </section>
            ) : null}
            <section aria-labelledby="studio-templates-title">
              <SectionTitle id="studio-templates-title" title="Plantillas para inspirarte" description="Todo es editable: cambia textos, colores, formas e imágenes.">
                <SeeAll label="Ver todas" onClick={() => changeView('templates')} />
              </SectionTitle>
              <TemplateGrid token={token} scopeKey={scopeKey} creating={creating} onUse={template => onCreate('template', template)} limit={6} />
            </section>
          </>
        )}
      </div>
    ),
    designs: (
      <section aria-labelledby="studio-designs-title">
        <SectionTitle id="studio-designs-title" as="h1" title="Mis diseños" description="Se guardan en tu empresa y puedes compartirlos con tu equipo." />
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput value={designQuery} onChange={event => setDesignQuery(event.target.value)} onClear={() => setDesignQuery('')}
            placeholder="Buscar en tus diseños" aria-label="Buscar en tus diseños" maxLength={80} className="w-full sm:max-w-sm" />
          <SegmentedControl options={SHARED} value={shared} onChange={setShared} ariaLabel="Mostrar diseños" className="w-full sm:ml-auto sm:w-[22rem] sm:shrink-0" />
        </div>
        {list({ q: designQ, shared, onClearSearch: () => setDesignQuery('') })}
      </section>
    ),
    templates: (
      <section aria-labelledby="studio-templates-page-title">
        <SectionTitle id="studio-templates-page-title" as="h1" title="Plantillas" description="Diseños originales listos para adaptar: todo es editable." />
        <TemplateGrid token={token} scopeKey={scopeKey} creating={creating} onUse={template => onCreate('template', template)} />
      </section>
    ),
  }
  return (
    <div ref={top} className="mx-auto w-full max-w-[1600px] px-4 pb-10 sm:px-6 lg:flex lg:gap-8 lg:px-8 lg:pt-6">
      <StudioHomeSidebar view={view} onView={changeView} creating={creating} onCreate={createFormat} onCustom={() => setSizeOpen(true)} />
      <div className="min-w-0 flex-1">
        <StudioHomeTabs view={view} onView={changeView} />
        <FadeSwap contentKey={view} className="pt-4 sm:pt-6 lg:pt-0">{views[view] ?? views.home}</FadeSwap>
      </div>
      {sizeOpen ? <StudioPageDialog open creating page={{ width: 1080, height: 1080, background: '#ffffff' }} onClose={() => setSizeOpen(false)} onApply={page => onCreate('custom', page, true)} /> : null}
    </div>
  )
}
