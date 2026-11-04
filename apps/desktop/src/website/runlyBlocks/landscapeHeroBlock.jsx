import { useRef } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { SceneArt, useDriftLayers } from './sceneArt.jsx'

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const STYLE = '@keyframes runly-cue{0%{transform:scaleY(0);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}51%{transform-origin:bottom}100%{transform:scaleY(0);transform-origin:bottom}}@media (prefers-reduced-motion:reduce){.runly-cue{animation:none!important}}'
const HEIGHTS = { '560px': 560, '680px': 680, '820px': 820 }

const button = (solid) => ({
  display: 'inline-flex', alignItems: 'center', padding: '15px 30px', borderRadius: '999px', fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '15px', textDecoration: 'none', letterSpacing: '.02em',
  background: solid ? 'var(--runly-color-accent, #f97316)' : 'transparent', color: solid ? '#1a0b00' : '#fff', border: solid ? '2px solid transparent' : '2px solid rgba(255,255,255,.7)',
})

function Hero({ scene, eyebrow, coordinates, title, highlight, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, height, cue }) {
  const root = useRef(null)
  useDriftLayers(root)
  return (
    <section ref={root} style={{ position: 'relative', overflow: 'hidden', minHeight: HEIGHTS[height] ?? 680, display: 'flex', alignItems: 'flex-start', color: '#fff' }}>
      <style>{STYLE}</style>
      <SceneArt scene={scene} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1200px', marginInline: 'auto', padding: `clamp(56px, 9vw, 120px) 24px ${cue ? '36%' : '30%'}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase' }}>
          <span style={{ width: '40px', height: '2px', background: 'var(--runly-color-accent, #f97316)' }} />
          {eyebrow && <span>{eyebrow}</span>}
          {coordinates && <span style={{ opacity: 0.75, fontWeight: 500 }}>{coordinates}</span>}
        </div>
        <h1 style={{ margin: '22px 0 0', maxWidth: '14ch', fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(46px, 9vw, 124px)', lineHeight: 0.95, letterSpacing: '-0.035em', textShadow: '0 2px 40px rgba(0,0,0,.25)' }}>
          {title}
          {highlight && <><br /><em style={{ fontWeight: 400, color: 'var(--runly-color-accent, #f97316)' }}>{highlight}</em></>}
        </h1>
        {subtitle && <p style={{ margin: '26px 0 0', maxWidth: '520px', fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(17px, 1.6vw, 20px)', lineHeight: 1.6, color: 'rgba(255,255,255,.92)' }}>{subtitle}</p>}
        {(ctaLabel || ctaSecondLabel) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '34px' }}>
            {ctaLabel && <a href={ctaHref || '#'} style={button(true)}>{ctaLabel}</a>}
            {ctaSecondLabel && <a href={ctaSecondHref || '#'} style={button(false)}>{ctaSecondLabel}</a>}
          </div>
        )}
      </div>
      {cue && (
        <div aria-hidden="true" style={{ position: 'absolute', zIndex: 1, left: '50%', bottom: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontFamily: 'var(--runly-font-sans)', fontSize: '11px', letterSpacing: '.3em', textTransform: 'uppercase', transform: 'translateX(-50%)' }}>
          <span>{cue}</span>
          <span className="runly-cue" style={{ width: '1px', height: '44px', background: '#fff', animation: 'runly-cue 2.4s ease-in-out infinite' }} />
        </div>
      )}
    </section>
  )
}

export const LandscapeHeroBlock = defineBlock({
  type: 'LandscapeHeroBlock',
  label: 'Hero de paisaje en capas',
  category: 'atlas',
  defaultProps: {
    scene: 'mountains', eyebrow: 'Cuaderno de viajes', coordinates: '', title: 'Viaja a donde', highlight: 'cambia el cielo',
    subtitle: 'Itinerarios a la medida, guías locales y hoteles con encanto.',
    ctaLabel: 'Ver destinos', ctaHref: '/destinos', ctaSecondLabel: '', ctaSecondHref: '',
    height: '820px', cue: 'Desplázate',
  },
  fields: {
    scene: { type: 'select', label: 'Paisaje', options: [{ value: 'mountains', label: 'Montañas al atardecer' }, { value: 'ocean', label: 'Mar' }, { value: 'desert', label: 'Desierto' }, { value: 'forest', label: 'Bosque' }] },
    eyebrow: { type: 'text', label: 'Antetítulo' }, coordinates: { type: 'text', label: 'Coordenadas o dato corto' },
    title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título en cursiva (color de acento)' }, subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    height: { type: 'select', label: 'Altura', options: [{ value: '560px', label: 'Baja' }, { value: '680px', label: 'Media' }, { value: '820px', label: 'Alta' }] },
    cue: { type: 'text', label: 'Indicador de scroll (vacío para ocultar)' },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'coordinates', 'title', 'highlight', 'subtitle'] },
    { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] },
    { label: 'Estilo', fields: ['scene', 'height', 'cue'] },
  ],
  render: (props) => <Hero {...props} />,
})
