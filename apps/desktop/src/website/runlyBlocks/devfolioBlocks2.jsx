import { useEffect, useRef, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { D, SANS, MONO, DEV_CSS, WRAP, lines, cells, safeHref, Icon, Device } from './devfolioArt.jsx'
import { Section, SectionTitle, Eyebrow, Btn } from './devfolioBlocks.jsx'

const INK = 'var(--runly-color-fg, #1A1A1A)'
const MUTED = 'var(--runly-color-muted, #5B5249)'
const DOTS = `repeating-linear-gradient(90deg, ${D.orange} 0 4px, transparent 4px 11px)`
const DOTS_V = `repeating-linear-gradient(180deg, ${D.orange} 0 4px, transparent 4px 11px)`
const Disc = ({ icon, size = 72 }) => <span style={{ display: 'grid', placeItems: 'center', flex: 'none', width: size, height: size, borderRadius: '50%', background: D.peach, border: `1.5px solid ${D.peachDeep}`, color: INK }}><Icon name={icon} size={size * 0.38} stroke={1.8} /></span>

// ---------------------------------------------------------------------------------------------------------------
const TL_CSS = `
@keyframes dv-growy{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.dv-tl{list-style:none;margin:34px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
.dv-tl>li{position:relative}
.dv-tl .cn{position:absolute;left:84px;top:35px;height:3px;width:calc(100% + 24px - 96px);background:${DOTS};transform-origin:left}
.dv-tl>li:last-child .cn{display:none}
.dv-tlv{list-style:none;margin:34px 0 0;padding:0;display:grid;gap:0;max-width:820px}
.dv-tlv>li{position:relative;display:grid;grid-template-columns:72px minmax(0,1fr);gap:0 24px;padding-bottom:36px}
.dv-tlv>li:last-child{padding-bottom:0}
.dv-tlv .cn{position:absolute;left:34px;top:80px;bottom:8px;width:3px;background:${DOTS_V};transform-origin:top}
.dv-tlv>li:last-child .cn{display:none}
@media (prefers-reduced-motion:no-preference){@supports (animation-timeline:view()){.dv-tlv .cn{animation:dv-growy linear both;animation-timeline:view();animation-range:entry 0% entry 100%}}}
@media (max-width:860px){.dv-tl{grid-template-columns:1fr;gap:28px}.dv-tl>li{display:grid;grid-template-columns:72px minmax(0,1fr);gap:0 20px}.dv-tl .cn{left:34px;top:80px;bottom:-24px;height:auto;width:3px;background:${DOTS_V}}}
`
export const DevTimelineBlock = defineBlock({
  type: 'DevTimelineBlock',
  label: 'Línea de tiempo de experiencia',
  category: 'atlas',
  defaultProps: {
    eyebrow: '04 / trayectoria', title: 'Experiencia', layout: 'horizontal',
    items: '2024 - Actualidad | Desarrollador web | Estudio Brújula | Construyo aplicaciones web escalables y paneles de administración para clientes. | briefcase\n2023 - 2024 | Practicante full stack | Proyectos varios | Trabajé en proyectos reales y APIs con el stack MERN, con revisiones de código semanales. | window\n2022 - 2023 | Desarrollador freelance | Independiente | Entregué sitios web y soluciones a medida para emprendimientos y negocios locales. | user',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' },
    layout: { type: 'select', label: 'Disposición', options: [{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }] },
    items: { type: 'textarea', label: 'Etapas (Fechas | Puesto | Empresa | Descripción | icono)' },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'items'] }, { label: 'Estilo', fields: ['layout'] }],
  render({ eyebrow, title, layout, items }) {
    const rows = cells(items)
    const vertical = layout === 'vertical'
    return (
      <Section>
        <style>{TL_CSS}</style>
        <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
        <ol className={vertical ? 'dv-tlv' : 'dv-tl'}>
          {rows.map(([dates, role, company, text, icon], index) => (
            <li key={dates + role} className="dv-rv" style={{ '--i': index }}>
              <Disc icon={icon || 'briefcase'} />
              <span className="cn dv-grow" aria-hidden="true" />
              <div style={{ paddingTop: vertical ? '6px' : '16px' }}>
                <p style={{ margin: 0, fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: D.orangeText }}>{dates}</p>
                <h3 style={{ margin: '6px 0 0', fontSize: '19px', fontWeight: 800, letterSpacing: '-0.01em' }}>{role}</h3>
                <p style={{ margin: '2px 0 0', fontSize: '14px', fontWeight: 700, color: D.orangeText }}>{company}</p>
                <p style={{ margin: '8px 0 0', fontSize: '15px', lineHeight: 1.65, color: MUTED, maxWidth: '40ch' }}>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const PR_CSS = `
.dv-steps{list-style:none;margin:34px 0 0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}
.dv-steps>li{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center}
.dv-steps .cn{position:absolute;top:35px;left:calc(50% + 46px);width:calc(100% + 16px - 92px);height:3px;background:${DOTS};transform-origin:left}
.dv-steps>li:last-child .cn{display:none}
.dv-steps .dc{transition:transform .2s ease,background .2s ease}
.dv-steps>li:hover .dc{transform:translateY(-4px) rotate(-4deg);background:${D.peachDeep}}
@media (max-width:900px){.dv-steps{grid-template-columns:repeat(2,minmax(0,1fr));gap:32px 16px}.dv-steps .cn{display:none}}
`
export const DevProcessBlock = defineBlock({
  type: 'DevProcessBlock',
  label: 'Mi proceso en pasos',
  category: 'atlas',
  defaultProps: {
    eyebrow: '05 / método', title: 'Mi proceso',
    steps: 'Descubrir | Entender el problema a fondo. | search\nDiseñar | Planear y dibujar soluciones simples. | pencil\nDesarrollar | Escribir código limpio y construir funciones. | code\nLanzar | Probar a fondo y publicar con calma. | rocket\nMejorar | Medir, iterar y seguir puliendo. | chart',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, steps: { type: 'textarea', label: 'Pasos (Nombre | Descripción | icono)' } },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'steps'] }],
  render({ eyebrow, title, steps }) {
    return (
      <Section>
        <style>{PR_CSS}</style>
        <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
        <ol className="dv-steps">
          {cells(steps).map(([name, text, icon], index) => (
            <li key={name} className="dv-rv" style={{ '--i': index }}>
              <span className="dc" style={{ display: 'grid', placeItems: 'center', width: 72, height: 72, borderRadius: '50%', background: D.peach, border: `1.5px solid ${D.peachDeep}`, color: INK }}><Icon name={icon} size={28} /></span>
              <span className="cn dv-grow" aria-hidden="true" />
              <span style={{ marginTop: '14px', fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: D.orangeText }}>{String(index + 1).padStart(2, '0')}</span>
              <h3 style={{ margin: '4px 0 0', fontSize: '17px', fontWeight: 800 }}>{name}</h3>
              <p style={{ margin: '6px 0 0', maxWidth: '20ch', fontSize: '14px', lineHeight: 1.55, color: MUTED }}>{text}</p>
            </li>
          ))}
        </ol>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const BAR_CSS = `
.dv-bars{list-style:none;margin:30px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:22px 56px}
.dv-bar-track{height:12px;border-radius:999px;background:${D.peach};border:1.5px solid ${D.ink};overflow:hidden}
.dv-bar-fill{height:100%;border-radius:999px;background:${D.orange};border-right:1.5px solid ${D.ink};transform-origin:left}
`
const levelOf = (n) => (n >= 90 ? 'Experto' : n >= 75 ? 'Avanzado' : n >= 55 ? 'Sólido' : 'En práctica')
export const DevSkillBarsBlock = defineBlock({
  type: 'DevSkillBarsBlock',
  label: 'Habilidades por nivel',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'nivel de dominio', title: 'Habilidades por nivel', subtitle: 'Mi punto de partida honesto en cada herramienta, de lo que uso a diario a lo que sigo aprendiendo.',
    skills: 'JavaScript y TypeScript | 92 | Mi lenguaje de cada día\nReact y Next.js | 88 | Interfaces y renderizado en servidor\nNode.js y APIs REST | 85 | Servicios, colas y autenticación\nBases de datos | 78 | PostgreSQL y MongoDB\nPruebas y calidad | 74 | Unitarias, integración y e2e\nDevOps básico | 62 | Docker y despliegues automáticos',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' }, skills: { type: 'textarea', label: 'Habilidades (Nombre | nivel 0-100 | Nota)' } },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'subtitle', 'skills'] }],
  render({ eyebrow, title, subtitle, skills }) {
    return (
      <Section>
        <style>{BAR_CSS}</style>
        <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
        {subtitle && <p style={{ margin: '18px 0 0', maxWidth: '58ch', fontSize: '17px', lineHeight: 1.7, color: MUTED }}>{subtitle}</p>}
        <ul className="dv-bars">
          {cells(skills).map(([name, level, note]) => {
            const value = Math.max(0, Math.min(100, Number(level) || 0))
            return (
              <li key={name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontWeight: 800, fontSize: '16px' }}>{name}</span>
                  <span style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: D.orangeText }}>{levelOf(value)} · {value}%</span>
                </div>
                <div className="dv-bar-track" role="img" aria-label={`${name}: ${value} de 100`} style={{ marginTop: '8px' }}><div className="dv-bar-fill dv-grow" style={{ width: `${value}%` }} /></div>
                {note && <p style={{ margin: '6px 0 0', fontSize: '14px', color: MUTED }}>{note}</p>}
              </li>
            )
          })}
        </ul>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
function Counter({ to, suffix }) {
  const [value, setValue] = useState(to)
  const ref = useRef(null)
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined
    let raf
    const run = () => { const start = performance.now(); const tick = (now) => { const p = Math.min(1, (now - start) / 1400); setValue(Math.round(to * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(tick) }; setValue(0); raf = requestAnimationFrame(tick) }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io.disconnect(); run() } }, { threshold: 0.4 })
    io.observe(ref.current)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [to])
  return <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>{value}{suffix}</span>
}

export const DevStoryBlock = defineBlock({
  type: 'DevStoryBlock',
  label: 'Historia con cifras',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'mi historia', title: 'De armar páginas a diseñar sistemas',
    body: 'Empecé a programar a los quince años, arreglando el sitio web de la papelería de mi barrio. Esa primera tarde entendí que el código es una forma de ayudar a otras personas a hacer su trabajo.\n\nHoy diseño y construyo productos completos: interfaces, servicios y la infraestructura que los sostiene. Me importa que lo que entrego sea claro para quien lo usa y también para quien lo mantiene después de mí.\n\nCuando no estoy frente a la pantalla, estoy en bicicleta, probando recetas nuevas o leyendo sobre arquitectura de software.',
    facts: '9 | + | años escribiendo software\n40 | + | proyectos entregados\n12 | | equipos con los que he trabajado\n100 | % | cuidado por los detalles',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, body: { type: 'textarea', label: 'Historia (párrafos separados por una línea en blanco)' }, facts: { type: 'textarea', label: 'Cifras (Número | sufijo | texto)' } },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'body', 'facts'] }],
  render({ eyebrow, title, body, facts }) {
    return (
      <Section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(28px, 5vw, 72px)' }}>
          <div>
            <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
            <div style={{ marginTop: '22px', display: 'grid', gap: '16px', maxWidth: '58ch', fontSize: '17px', lineHeight: 1.75, color: MUTED }}>
              {String(body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p, i) => <p key={i} style={{ margin: 0 }}>{p}</p>)}
            </div>
          </div>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px', alignContent: 'start' }}>
            {cells(facts).map(([n, suffix, label], i) => (
              <div key={label} className="dv-rv" style={{ '--i': i, padding: '22px 20px', background: i % 3 === 0 ? D.peach : D.white, border: `1.5px solid ${D.ink}`, borderRadius: '16px', boxShadow: `0 6px 0 -2px ${D.orange}` }}>
                <dd style={{ margin: 0, fontSize: 'clamp(34px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}><Counter to={Number(n) || 0} suffix={suffix} /></dd>
                <dt style={{ margin: '8px 0 0', fontSize: '14px', lineHeight: 1.4, color: MUTED, fontWeight: 600 }}>{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
export const DevValuesBlock = defineBlock({
  type: 'DevValuesBlock',
  label: 'Valores sobre tinta',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'cómo trabajo', title: 'Lo que me guía',
    values: 'Claridad antes que ingenio | El código que cualquiera entiende cuesta menos de mantener que el que solo yo entiendo. | code\nEmpatía con quien usa | Cada pantalla la usa una persona con prisa, con cansancio o con dudas. Diseño pensando en ella. | users\nPequeños pasos, entregas reales | Prefiero publicar algo útil cada semana que prometer algo perfecto en seis meses. | rocket\nCuriosidad con criterio | Pruebo lo nuevo, pero solo lo adopto cuando resuelve un problema real. | spark',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, values: { type: 'textarea', label: 'Valores (Título | Descripción | icono)' } },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'values'] }],
  render({ eyebrow, title, values }) {
    return (
      <section className="dv" style={{ background: D.ink, color: D.cream, fontFamily: SANS, padding: 'clamp(48px, 6vw, 84px) 0' }}>
        <style>{DEV_CSS}</style>
        <div style={WRAP}>
          <p style={{ margin: 0, fontFamily: MONO, fontSize: '13px', fontWeight: 600, color: D.orange }}>{eyebrow}</p>
          <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.025em' }}>{title}</h2>
          <svg aria-hidden="true" viewBox="0 0 84 10" width="84" height="10" style={{ display: 'block', marginTop: '10px' }}><path className="dv-draw" pathLength="100" d="M3 6 C18 1.5 30 9 46 4.5 S70 3.5 81 5.5" stroke={D.orange} strokeWidth="3.4" strokeLinecap="round" fill="none" /></svg>
          <ul style={{ listStyle: 'none', margin: '34px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: '28px 32px' }}>
            {cells(values).map(([name, text, icon], i) => (
              <li key={name} className="dv-rv" style={{ '--i': i, borderTop: `2px solid ${D.orange}`, paddingTop: '18px' }}>
                <span style={{ color: D.orange }}><Icon name={icon} size={30} stroke={1.7} /></span>
                <h3 style={{ margin: '14px 0 0', fontSize: '19px', fontWeight: 800, lineHeight: 1.25 }}>{name}</h3>
                <p style={{ margin: '8px 0 0', fontSize: '15px', lineHeight: 1.65, color: 'rgba(251,246,238,.78)' }}>{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
export const DevNowUsesBlock = defineBlock({
  type: 'DevNowUsesBlock',
  label: 'Ahora y herramientas',
  category: 'atlas',
  defaultProps: {
    nowTitle: 'Ahora mismo', nowItems: 'code | Construyendo | Un sistema de reservas para una red de clínicas.\nbook | Leyendo | Diseño de aplicaciones intensivas en datos.\nspark | Aprendiendo | Rust, a ratos y sin prisa.\ncoffee | Fuera de pantalla | Ciclismo de ruta y café de especialidad.',
    usesTitle: 'Mis herramientas', usesItems: 'Editor | Neovim y VS Code\nTerminal | WezTerm con zsh\nNavegador | Firefox Developer Edition\nDiseño | Figma y papel cuadriculado\nNotas | Un cuaderno de hojas sueltas\nHardware | Laptop de 14 pulgadas y teclado mecánico',
  },
  fields: { nowTitle: { type: 'text', label: 'Título de "ahora"' }, nowItems: { type: 'textarea', label: 'Ahora (icono | Etiqueta | Texto)' }, usesTitle: { type: 'text', label: 'Título de herramientas' }, usesItems: { type: 'textarea', label: 'Herramientas (Categoría | Herramienta)' } },
  groups: [{ label: 'Ahora', fields: ['nowTitle', 'nowItems'] }, { label: 'Herramientas', fields: ['usesTitle', 'usesItems'] }],
  render({ nowTitle, nowItems, usesTitle, usesItems }) {
    return (
      <Section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(28px, 5vw, 64px)' }}>
          <div>
            <SectionTitle eyebrow="/ahora">{nowTitle}</SectionTitle>
            <ul style={{ listStyle: 'none', margin: '26px 0 0', padding: 0, display: 'grid', gap: '18px' }}>
              {cells(nowItems).map(([icon, label, text]) => (
                <li key={label} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr)', gap: '14px', alignItems: 'start' }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '12px', background: D.peach, color: D.orangeText }}><Icon name={icon} size={22} /></span>
                  <span><strong style={{ display: 'block', fontSize: '16px' }}>{label}</strong><span style={{ fontSize: '15px', lineHeight: 1.6, color: MUTED }}>{text}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionTitle eyebrow="/usos">{usesTitle}</SectionTitle>
            <dl style={{ margin: '26px 0 0', display: 'grid' }}>
              {cells(usesItems).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: '12px', padding: '12px 0', borderBottom: `1.5px dashed ${D.peachDeep}` }}>
                  <dt style={{ flex: 'none', width: '110px', fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: D.orangeText }}>{k}</dt>
                  <dd style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
export const DevCaseBlock = defineBlock({
  type: 'DevCaseBlock',
  label: 'Caso de estudio destacado',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'caso de estudio', title: 'Lumen Académico: de 9 a 2 segundos de carga', body: 'La plataforma tardaba casi diez segundos en abrir un curso. Medimos, priorizamos lo que más pesaba y reescribimos la capa de datos con caché y renderizado en servidor, sin detener las clases en curso.',
    metrics: '-78% | tiempo de carga\n+34% | cursos terminados\n99.9% | disponibilidad', ctaLabel: 'Hablemos de tu proyecto', ctaHref: '/contacto',
  },
  fields: { eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, body: { type: 'textarea', label: 'Texto' }, metrics: { type: 'textarea', label: 'Resultados (Cifra | Texto)' }, ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' } },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'body', 'metrics'] }, { label: 'Botón', fields: ['ctaLabel', 'ctaHref'] }],
  render({ eyebrow, title, body, metrics, ctaLabel, ctaHref }) {
    return (
      <Section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(24px, 4vw, 56px)', alignItems: 'center', background: D.peach, border: `2px solid ${D.ink}`, borderRadius: '22px', boxShadow: `0 10px 0 -2px ${D.orange}`, padding: 'clamp(24px, 4vw, 48px)' }}>
          <div className="dv-par" style={{ maxWidth: '440px', justifySelf: 'center', width: '100%' }}><Device type="monitor" kind={1} /></div>
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <h2 style={{ margin: '8px 0 0', fontSize: 'clamp(24px, 2.8vw, 34px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15 }}>{title}</h2>
            <p style={{ margin: '14px 0 0', fontSize: '16px', lineHeight: 1.7, color: MUTED, maxWidth: '52ch' }}>{body}</p>
            <ul style={{ listStyle: 'none', margin: '22px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '14px 28px' }}>
              {cells(metrics).map(([n, label]) => <li key={label}><strong style={{ display: 'block', fontSize: '28px', fontWeight: 900, letterSpacing: '-0.03em', color: INK }}>{n}</strong><span style={{ fontSize: '13px', color: MUTED, fontWeight: 600 }}>{label}</span></li>)}
            </ul>
            <div style={{ marginTop: '24px' }}><Btn href={ctaHref}>{ctaLabel}</Btn></div>
          </div>
        </div>
      </Section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
const CT_CSS = `
.dv-ct a.ic{display:flex;align-items:center;gap:12px;min-height:44px;color:${D.ink};text-decoration:none;font-weight:600;font-size:15px}
.dv-ct a.ic:hover span.t{text-decoration:underline;text-decoration-color:${D.orange};text-decoration-thickness:2px;text-underline-offset:4px}
.dv-ct a.sb{display:grid;place-items:center;width:48px;height:48px;border:1.5px solid ${D.ink};border-radius:10px;background:${D.white};color:${D.ink};transition:transform .18s ease,background .18s ease}
.dv-ct a.sb:hover{transform:translateY(-3px);background:${D.orange}}
`
const hrefFor = (kind, value) => (kind === 'mail' ? `mailto:${value}` : kind === 'phone' ? `tel:${String(value).replace(/[^\d+]/g, '')}` : '')
export const DevContactBlock = defineBlock({
  type: 'DevContactBlock',
  label: 'Banda de contacto',
  category: 'atlas',
  defaultProps: {
    title: 'Construyamos algo', highlight: 'significativo juntos.', subtitle: 'Cuéntame tu idea o el problema que quieres resolver; te respondo en menos de un día hábil.',
    email: 'hola@example.com', phone: '+52 55 0000 0000', location: 'Guadalajara, México', connectTitle: 'Conectemos',
    socials: 'GitHub | https://github.com/example | github\nLinkedIn | https://www.linkedin.com/in/example | linkedin\nX | https://x.com/example | x\nCorreo | mailto:hola@example.com | mail',
  },
  fields: {
    title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Final del título (en naranja)' }, subtitle: { type: 'textarea', label: 'Descripción' },
    email: { type: 'text', label: 'Correo' }, phone: { type: 'text', label: 'Teléfono' }, location: { type: 'text', label: 'Ubicación' }, connectTitle: { type: 'text', label: 'Título de redes' },
    socials: { type: 'textarea', label: 'Redes (Nombre | enlace | icono)' },
  },
  groups: [{ label: 'Mensaje', fields: ['title', 'highlight', 'subtitle'] }, { label: 'Datos', fields: ['email', 'phone', 'location'] }, { label: 'Redes', fields: ['connectTitle', 'socials'] }],
  render({ title, highlight, subtitle, email, phone, location, connectTitle, socials }) {
    const rows = [['mail', email, 'mail'], ['phone', phone, 'phone'], ['pin', location, '']].filter((r) => r[1])
    return (
      <section className="dv dv-ct" style={{ background: D.peach, borderTop: `2px solid ${D.ink}`, fontFamily: SANS, color: INK, padding: 'clamp(44px, 6vw, 80px) 0' }}>
        <style>{`${DEV_CSS}${CT_CSS}`}</style>
        <div style={{ ...WRAP, display: 'flex', flexWrap: 'wrap', gap: '32px clamp(24px, 5vw, 72px)', alignItems: 'flex-start' }}>
          <div style={{ flex: '2 1 360px', minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 'clamp(28px, 3.4vw, 44px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.08 }}>{title} <span style={{ color: D.display }}>{highlight}</span></h2>
            <svg aria-hidden="true" viewBox="0 0 84 10" width="84" height="10" style={{ display: 'block', marginTop: '12px' }}><path className="dv-draw" pathLength="100" d="M3 6 C18 1.5 30 9 46 4.5 S70 3.5 81 5.5" stroke={D.orange} strokeWidth="3.4" strokeLinecap="round" fill="none" /></svg>
            <p style={{ margin: '16px 0 0', maxWidth: '36ch', fontSize: '16px', lineHeight: 1.65, color: MUTED }}>{subtitle}</p>
          </div>
          <ul style={{ flex: '1 1 220px', minWidth: 0, listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
            {rows.map(([icon, value, kind]) => {
              const href = hrefFor(kind, value)
              const inner = <><span style={{ color: D.orangeText }}><Icon name={icon} size={22} /></span><span className="t">{value}</span></>
              return <li key={icon}>{href ? <a className="ic" href={href}>{inner}</a> : <span className="ic" style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', fontWeight: 600, fontSize: '15px' }}>{inner}</span>}</li>
            })}
          </ul>
          <div style={{ flex: '1 1 200px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{connectTitle}</h3>
            <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {cells(socials).map(([name, href, icon]) => <li key={name}><a className="sb" href={safeHref(href)} aria-label={name}><Icon name={icon} size={22} /></a></li>)}
            </ul>
          </div>
        </div>
      </section>
    )
  },
})

// ---------------------------------------------------------------------------------------------------------------
export const DevChannelsBlock = defineBlock({
  type: 'DevChannelsBlock',
  label: 'Canales y disponibilidad',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'canales', title: 'Elige cómo escribirme',
    channels: 'mail | Correo | hola@example.com | mailto:hola@example.com\nphone | Teléfono | +52 55 0000 0000 | tel:+525500000000\nlinkedin | LinkedIn | /in/daniel-ramos-example | https://www.linkedin.com/in/example\ngithub | GitHub | @daniel-ramos-example | https://github.com/example',
    availabilityTitle: 'Disponibilidad', availabilityStatus: 'Aceptando proyectos desde enero', availabilityItems: 'Respuesta | En menos de 24 horas hábiles\nHorario | Lunes a viernes, 9:00 a 18:00 (CST)\nModalidad | Remoto, con visitas puntuales en Guadalajara\nTipo de trabajo | Proyectos de 2 a 6 meses o apoyo por horas',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Etiqueta' }, title: { type: 'text', label: 'Título' }, channels: { type: 'textarea', label: 'Canales (icono | Nombre | Valor | Enlace)' },
    availabilityTitle: { type: 'text', label: 'Título de disponibilidad' }, availabilityStatus: { type: 'text', label: 'Estado actual' }, availabilityItems: { type: 'textarea', label: 'Detalles (Etiqueta | Texto)' },
  },
  groups: [{ label: 'Canales', fields: ['eyebrow', 'title', 'channels'] }, { label: 'Disponibilidad', fields: ['availabilityTitle', 'availabilityStatus', 'availabilityItems'] }],
  render({ eyebrow, title, channels, availabilityTitle, availabilityStatus, availabilityItems }) {
    return (
      <Section>
        <style>{TILE_LIFT}</style>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'clamp(24px, 4vw, 56px)', alignItems: 'start' }}>
          <div>
            <SectionTitle eyebrow={eyebrow}>{title}</SectionTitle>
            <ul style={{ listStyle: 'none', margin: '26px 0 0', padding: 0, display: 'grid', gap: '14px' }}>
              {cells(channels).map(([icon, name, value, href], i) => (
                <li key={name} className="dv-rv" style={{ '--i': i }}>
                  <a className="dv-lift" href={safeHref(href)} style={{ display: 'flex', alignItems: 'center', gap: '16px', minHeight: '72px', padding: '14px 18px', background: D.white, border: `1.5px solid ${D.line}`, borderRadius: '14px', color: INK, textDecoration: 'none' }}>
                    <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '50%', background: D.peach, color: D.orangeText, flex: 'none' }}><Icon name={icon} size={22} /></span>
                    <span style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: '15px' }}>{name}</strong><span style={{ display: 'block', fontSize: '14px', color: MUTED, overflowWrap: 'anywhere' }}>{value}</span></span>
                    <span style={{ marginLeft: 'auto', color: D.orangeText }}><Icon name="arrow" size={18} stroke={2.2} /></span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <aside style={{ background: D.ink, color: D.cream, borderRadius: '20px', padding: 'clamp(22px, 3vw, 36px)', boxShadow: `0 10px 0 -2px ${D.orange}` }} aria-label={availabilityTitle}>
            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>{availabilityTitle}</h3>
            <p style={{ margin: '12px 0 0', display: 'flex', alignItems: 'center', gap: '10px', fontFamily: MONO, fontSize: '14px', color: D.orange }}><span aria-hidden="true" className="dv-pulse" style={{ width: '10px', height: '10px', borderRadius: '50%', background: D.orange }} />{availabilityStatus}</p>
            <dl style={{ margin: '20px 0 0', display: 'grid', gap: '0' }}>
              {cells(availabilityItems).map(([k, v]) => (
                <div key={k} style={{ padding: '13px 0', borderTop: '1px solid rgba(251,246,238,.2)' }}>
                  <dt style={{ fontFamily: MONO, fontSize: '12px', fontWeight: 700, color: D.orange, textTransform: 'uppercase', letterSpacing: '.08em' }}>{k}</dt>
                  <dd style={{ margin: '4px 0 0', fontSize: '15px', lineHeight: 1.5 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      </Section>
    )
  },
})
const TILE_LIFT = `.dv-lift{transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}.dv-lift:hover{transform:translateY(-3px);border-color:${D.ink};box-shadow:0 6px 0 -2px ${D.orange}}@keyframes dv-pulse{0%,100%{box-shadow:0 0 0 0 rgba(242,106,27,.55)}70%{box-shadow:0 0 0 9px rgba(242,106,27,0)}}@media (prefers-reduced-motion:no-preference){.dv-pulse{animation:dv-pulse 2.4s ease-out infinite}}`
