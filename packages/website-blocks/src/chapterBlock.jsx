import { useRef } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { SceneArt, useDriftLayers } from './sceneArt.jsx'

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const ARCH = '50% 50% 28px 28px / 34% 34% 28px 28px'

// "Label | Value" per line.
function parseDetails(raw) {
  return String(raw ?? '').split('\n').map((line) => line.split('|').map((part) => part.trim())).filter(([label, value]) => label && value).slice(0, 4)
}

function Chapter({ scene, index, kicker, title, body, details, place, ctaLabel, ctaHref, flip, tone }) {
  const root = useRef(null)
  useDriftLayers(root, 1)
  const dark = tone === 'dark'
  const rows = parseDetails(details)
  const copy = (
    <div style={{ position: 'relative', alignSelf: 'center' }}>
      <div aria-hidden="true" data-drift="-0.07" style={{ position: 'absolute', top: '-0.52em', [flip === 'right' ? 'right' : 'left']: '-0.08em', fontFamily: SERIF, fontStyle: 'italic', fontSize: 'clamp(150px, 24vw, 340px)', lineHeight: 0.8, fontWeight: 400, color: dark ? '#fff' : 'var(--runly-color-primary, #0e7490)', opacity: dark ? 0.07 : 0.09, userSelect: 'none', pointerEvents: 'none', willChange: 'transform' }}>{index}</div>
      <div style={{ position: 'relative' }}>
        {kicker && <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '14px', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: dark ? 'var(--runly-color-accent, #f97316)' : '#C2410C' }}><span style={{ width: '32px', height: '2px', background: 'currentColor' }} />{kicker}</p>}
        <h2 style={{ margin: '18px 0 0', fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(38px, 5.4vw, 76px)', lineHeight: 1, letterSpacing: '-0.03em', color: dark ? '#fff' : 'var(--runly-color-fg, #0b1b2b)' }}>{title}</h2>
        {body && <p style={{ margin: '22px 0 0', maxWidth: '46ch', fontFamily: 'var(--runly-font-sans)', fontSize: '18px', lineHeight: 1.7, color: dark ? 'rgba(255,255,255,.82)' : 'var(--runly-color-muted, #5b6b7c)' }}>{body}</p>}
        {rows.length > 0 && (
          <dl style={{ margin: '28px 0 0', display: 'grid', gridTemplateColumns: `repeat(${Math.min(rows.length, 3)}, auto)`, justifyContent: 'start', gap: '14px 36px', fontFamily: 'var(--runly-font-sans)' }}>
            {rows.map(([label, value]) => (
              <div key={label} style={{ borderLeft: `2px solid ${dark ? 'rgba(255,255,255,.35)' : 'rgba(11,27,43,.2)'}`, paddingLeft: '12px' }}>
                <dt style={{ fontSize: '11px', letterSpacing: '.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,.6)' : 'var(--runly-color-muted, #5b6b7c)' }}>{label}</dt>
                <dd style={{ margin: '4px 0 0', fontFamily: SERIF, fontSize: '22px', color: dark ? '#fff' : 'var(--runly-color-fg, #0b1b2b)' }}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {ctaLabel && <a href={ctaHref || '#'} style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginTop: '32px', padding: '14px 26px', borderRadius: '999px', fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '15px', textDecoration: 'none', background: dark ? '#fff' : 'var(--runly-color-fg, #0b1b2b)', color: dark ? '#0b1b2b' : '#fff' }}>{ctaLabel}<span aria-hidden="true">→</span></a>}
      </div>
    </div>
  )
  const poster = (
    <div style={{ position: 'relative', width: '100%', maxWidth: '460px', justifySelf: flip === 'right' ? 'start' : 'end', alignSelf: 'center' }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: ARCH, overflow: 'hidden', boxShadow: dark ? '0 30px 80px rgba(0,0,0,.5)' : '0 30px 70px rgba(11,27,43,.22)' }}>
        <SceneArt scene={scene} />
      </div>
      {place && <div style={{ position: 'absolute', left: '50%', bottom: '-16px', transform: 'translateX(-50%)', whiteSpace: 'nowrap', padding: '9px 18px', borderRadius: '999px', background: '#fff', color: '#0b1b2b', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', boxShadow: '0 10px 28px rgba(0,0,0,.2)' }}>{place}</div>}
    </div>
  )
  return (
    <section ref={root} style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(72px, 10vw, 140px) 24px', background: dark ? 'linear-gradient(180deg, #0B1B2B 0%, #10263a 100%)' : 'var(--runly-color-bg, #f8fafc)' }}>
      <div style={{ maxWidth: '1200px', marginInline: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 'clamp(40px, 6vw, 96px)' }}>
        {flip === 'right' ? <>{poster}{copy}</> : <>{copy}{poster}</>}
      </div>
    </section>
  )
}

export const ChapterBlock = defineBlock({
  type: 'ChapterBlock',
  label: 'Capítulo editorial con paisaje',
  category: 'atlas',
  defaultProps: {
    scene: 'ocean', index: '01', kicker: 'Capítulo uno', title: 'Costa del Pacífico',
    body: 'Atardeceres largos, surf suave y cocina de mar a pie de playa.',
    details: 'Mejor época | Nov – Abr\nDuración | 5 a 9 días\nDesde | $18,900',
    place: 'Pacífico · 19.4° N', ctaLabel: 'Ver itinerario', ctaHref: '/contacto', flip: 'left', tone: 'light',
  },
  fields: {
    scene: { type: 'select', label: 'Paisaje', options: [{ value: 'ocean', label: 'Mar' }, { value: 'mountains', label: 'Montañas al atardecer' }, { value: 'desert', label: 'Desierto' }, { value: 'forest', label: 'Bosque' }] },
    index: { type: 'text', label: 'Número del capítulo' }, kicker: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, body: { type: 'textarea', label: 'Descripción' },
    details: { type: 'textarea', label: 'Datos (Etiqueta | Valor, uno por línea, máx. 4)' }, place: { type: 'text', label: 'Etiqueta sobre la ilustración' },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' },
    flip: { type: 'select', label: 'Texto a', options: [{ value: 'left', label: 'Izquierda' }, { value: 'right', label: 'Derecha' }] },
    tone: { type: 'select', label: 'Fondo', options: [{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['index', 'kicker', 'title', 'body', 'details', 'place'] },
    { label: 'Botón', fields: ['ctaLabel', 'ctaHref'] },
    { label: 'Estilo', fields: ['scene', 'flip', 'tone'] },
  ],
  render: (props) => <Chapter {...props} />,
})
