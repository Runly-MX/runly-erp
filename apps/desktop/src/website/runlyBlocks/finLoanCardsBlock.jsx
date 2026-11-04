import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { FinIcon } from './finHeroBlock.jsx'

const STYLE = `
.fin-loan{position:relative;overflow:hidden;transition:transform .25s ease,box-shadow .25s ease}
.fin-loan:hover,.fin-loan:focus-visible{transform:translateY(-6px);box-shadow:0 28px 50px -22px rgba(11,61,46,.4)}
.fin-loan:focus-visible{outline:3px solid #0B4F39;outline-offset:3px}
.fin-loan:hover .fin-loan-arrow{transform:translateX(4px)}.fin-loan-arrow{transition:transform .2s ease}
.fin-step-line{position:absolute;top:28px;left:12%;right:12%;height:2px;background:repeating-linear-gradient(90deg,#8FCDB1 0 8px,transparent 8px 16px)}
@media (max-width:820px){.fin-step-line{display:none}}
@media (prefers-reduced-motion:reduce){.fin-loan,.fin-loan-arrow{transition:none}.fin-loan:hover{transform:none}}`

const ICON_PATHS = {
  personal: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  car: 'M5 16l1.5-5.5A2 2 0 018.4 9h7.2a2 2 0 011.9 1.5L19 16M3 16h18v3H3zM7 19v1.5M17 19v1.5',
  business: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
}
const KEYS = Object.keys(ICON_PATHS)

// "Title | Description | From rate | Link | icon" per line (icon: personal, home, car or business; defaults by position).
function parseLoans(raw) {
  if (typeof raw !== 'string') return []
  return raw.split('\n').map((row) => row.trim()).filter(Boolean).map((row, index) => {
    const [name = '', description = '', rate = '', href = '', icon = ''] = row.split('|').map((part) => part.trim())
    return { name, description, rate, href, icon: ICON_PATHS[icon] ? icon : KEYS[index % KEYS.length] }
  }).filter((loan) => loan.name).slice(0, 8)
}

const Heading = ({ eyebrow, title, subtitle, center }) => (
  <div style={{ maxWidth: '640px', margin: center ? '0 auto 48px' : '0 0 40px', textAlign: center ? 'center' : 'left' }}>
    {eyebrow && <p style={{ margin: '0 0 10px', color: '#0F6B4B', fontSize: '13px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{eyebrow}</p>}
    {title && <h2 style={{ margin: 0, color: '#0B2E22', fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.03em' }}>{title}</h2>}
    {subtitle && <p style={{ margin: '14px 0 0', color: '#3F5B4E', fontSize: '17px', lineHeight: 1.65 }}>{subtitle}</p>}
  </div>
)

export const FinLoanCardsBlock = defineBlock({
  type: 'FinLoanCardsBlock',
  label: 'Tarjetas de préstamos',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Nuestros productos', title: 'Un crédito para cada meta', subtitle: 'Opciones transparentes con tasas competitivas y plazos que se adaptan a tu presupuesto.',
    loans: 'Préstamo personal | Fondos para los momentos importantes, con pagos fijos y sin sorpresas. | Desde 12.9% | /prestamos | personal\nCrédito hipotecario | Tu casa soñada con tasas competitivas y plazos de hasta 30 años. | Desde 9.5% | /prestamos | home\nCrédito automotriz | Estrena auto con aprobación rápida, nuevo o seminuevo. | Desde 10.9% | /prestamos | car\nCrédito empresarial | Financiamiento a la medida del flujo de caja de tu negocio. | Desde 13.5% | /prestamos | business',
    rateLabel: 'Tasa anual', columns: '4', background: 'white',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    loans: { type: 'textarea', label: 'Préstamos (Título | Descripción | Tasa | Enlace | Ícono: personal, home, car o business; uno por línea)' },
    rateLabel: { type: 'text', label: 'Etiqueta de la tasa' },
    columns: { type: 'select', label: 'Columnas', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'white', label: 'Blanco' }, { value: 'muted', label: 'Verde suave' }] },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'subtitle', 'loans', 'rateLabel'] }, { label: 'Estilo', fields: ['columns', 'background'] }],
  render({ eyebrow, title, subtitle, loans, rateLabel, columns, background }) {
    const items = parseLoans(loans)
    const min = { 2: 420, 3: 300, 4: 240 }[columns] ?? 240
    return (
      <section style={{ padding: 'clamp(56px, 7vw, 96px) 24px', background: background === 'muted' ? '#EAF6F0' : '#fff', fontFamily: 'var(--runly-font-sans)' }}>
        <style>{STYLE}</style>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          <Heading eyebrow={eyebrow} title={title} subtitle={subtitle} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: '20px' }}>
            {items.map((loan, index) => {
              const Tag = loan.href ? 'a' : 'div'
              return (
                <Tag key={`${loan.name}-${index}`} className="fin-loan" href={loan.href || undefined} style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '270px', padding: '28px', borderRadius: '28px', textDecoration: 'none', color: '#0B2E22', background: 'linear-gradient(160deg,#F2FAF6 0%,#fff 70%)', boxShadow: '0 1px 2px rgba(11,61,46,.06), 0 0 0 1px rgba(23,131,94,.12)' }}>
                  <span aria-hidden="true" style={{ position: 'absolute', right: '-46px', top: '-46px', width: '150px', height: '150px', borderRadius: '50%', background: index % 2 ? 'rgba(143,205,177,.35)' : 'rgba(52,176,127,.22)' }} />
                  <span aria-hidden="true" style={{ position: 'absolute', right: '30px', bottom: '-60px', width: '110px', height: '110px', borderRadius: '50%', background: 'rgba(23,131,94,.08)' }} />
                  <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: '56px', height: '56px', borderRadius: '18px', color: '#fff', background: 'linear-gradient(145deg,#17835E,#0B4F39)', boxShadow: '0 12px 22px -10px rgba(15,107,75,.8)' }}><FinIcon d={ICON_PATHS[loan.icon]} size={26} width={1.8} /></span>
                  <h3 style={{ position: 'relative', margin: '6px 0 0', fontSize: '21px', fontWeight: 800, letterSpacing: '-.02em' }}>{loan.name}</h3>
                  <p style={{ position: 'relative', margin: 0, flex: 1, color: '#3F5B4E', fontSize: '15px', lineHeight: 1.6 }}>{loan.description}</p>
                  <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid rgba(23,131,94,.18)' }}>
                    <span><span style={{ display: 'block', fontSize: '11px', color: '#4F6B5E', fontWeight: 600 }}>{rateLabel}</span><span style={{ fontSize: '17px', fontWeight: 800, color: '#0F6B4B', fontVariantNumeric: 'tabular-nums' }}>{loan.rate}</span></span>
                    {loan.href && <span className="fin-loan-arrow" style={{ display: 'grid', placeItems: 'center', width: '40px', height: '40px', borderRadius: '50%', background: '#D9F2E6', color: '#0B4F39' }}><FinIcon d="M5 12h14M13 6l6 6-6 6" size={18} /></span>}
                  </span>
                </Tag>
              )
            })}
          </div>
        </div>
      </section>
    )
  },
})

// "Title | Description" per line.
function parseSteps(raw) {
  if (typeof raw !== 'string') return []
  return raw.split('\n').map((row) => row.trim()).filter(Boolean).map((row) => {
    const [name = '', description = ''] = row.split('|').map((part) => part.trim())
    return { name, description }
  }).filter((step) => step.name).slice(0, 4)
}

export const FinStepsBlock = defineBlock({
  type: 'FinStepsBlock',
  label: 'Pasos con línea guía',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Pasos simples', title: 'Cómo funciona', subtitle: 'Empezar es fácil. Sigue estos tres pasos y toma el control de tu futuro financiero.',
    steps: 'Solicita en línea | Completa una solicitud sencilla en pocos minutos, desde tu celular o computadora.\nRecibe tu aprobación | Te respondemos en menos de 24 horas, sin comisiones ocultas ni letras chiquitas.\nObtén tus fondos | El dinero se deposita en tu cuenta en cuanto firmas digitalmente.',
    background: 'muted',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    steps: { type: 'textarea', label: 'Pasos (Título | Descripción; uno por línea)' },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'white', label: 'Blanco' }, { value: 'muted', label: 'Verde suave' }] },
  },
  groups: [{ label: 'Contenido', fields: ['eyebrow', 'title', 'subtitle', 'steps'] }, { label: 'Estilo', fields: ['background'] }],
  render({ eyebrow, title, subtitle, steps, background }) {
    const items = parseSteps(steps)
    return (
      <section style={{ padding: 'clamp(56px, 7vw, 96px) 24px', background: background === 'muted' ? '#EAF6F0' : '#fff', fontFamily: 'var(--runly-font-sans)' }}>
        <style>{STYLE}</style>
        <div style={{ maxWidth: '1100px', marginInline: 'auto' }}>
          <Heading eyebrow={eyebrow} title={title} subtitle={subtitle} center />
          <div style={{ position: 'relative' }}>
          <span className="fin-step-line" aria-hidden="true" />
          <ol style={{ position: 'relative', display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`, gap: '32px', margin: 0, padding: 0, listStyle: 'none' }}>
            {items.map((step, index) => (
              <li key={`${step.name}-${index}`} style={{ position: 'relative', textAlign: 'center' }}>
                <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: '58px', height: '58px', margin: '0 auto 20px', borderRadius: '50%', color: '#fff', fontSize: '22px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', background: 'linear-gradient(145deg,#17835E,#0B4F39)', boxShadow: '0 0 0 8px #EAF6F0, 0 14px 24px -10px rgba(15,107,75,.8)' }}>{index + 1}</span>
                <h3 style={{ margin: '0 0 8px', color: '#0B2E22', fontSize: '20px', fontWeight: 800, letterSpacing: '-.02em' }}>{step.name}</h3>
                <p style={{ margin: '0 auto', maxWidth: '300px', color: '#3F5B4E', fontSize: '15px', lineHeight: 1.6 }}>{step.description}</p>
              </li>
            ))}
          </ol>
          </div>
        </div>
      </section>
    )
  },
})
