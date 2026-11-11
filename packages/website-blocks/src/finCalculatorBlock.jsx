import { useId, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { finMoney } from './finHeroBlock.jsx'

const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }
const STYLE = `
.fin-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;border-radius:99px;background:linear-gradient(90deg,#17835E var(--fill,50%),#CFE7DB var(--fill,50%));outline:none;margin:14px 0 4px;cursor:pointer}
.fin-range::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;border:3px solid #0F6B4B;box-shadow:0 4px 10px rgba(11,61,46,.3);transition:transform .15s ease}
.fin-range::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:3px solid #0F6B4B;box-shadow:0 4px 10px rgba(11,61,46,.3)}
.fin-range:hover::-webkit-slider-thumb{transform:scale(1.1)}
.fin-range:focus-visible{outline:3px solid #0B4F39;outline-offset:6px}
.fin-calc-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:28px;align-items:stretch}
@media (max-width:860px){.fin-calc-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.fin-range::-webkit-slider-thumb{transition:none}}`

// Standard amortised payment: P*r / (1 - (1+r)^-n), with r the monthly rate. A zero rate splits the capital evenly.
export function calculateLoan(amount, months, annualRate) {
  const principal = Math.max(0, Number(amount) || 0)
  const n = Math.max(1, Math.round(Number(months) || 1))
  const r = Math.max(0, Number(annualRate) || 0) / 100 / 12
  const monthly = r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n)
  const total = monthly * n
  return { monthly, total, interest: total - principal }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const pct = (value, min, max) => `${((value - min) / (max - min)) * 100}%`

function Slider({ id, label, value, min, max, step, display, onChange, hint }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <label htmlFor={id} style={{ fontSize: '14px', fontWeight: 700, color: '#2F4A3E' }}>{label}</label>
        <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.02em', color: '#0B2E22', ...NUM }}>{display}</span>
      </div>
      <input id={id} className="fin-range" type="range" min={min} max={max} step={step} value={value} style={{ '--fill': pct(value, min, max) }} onChange={(event) => onChange(Number(event.target.value))} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#4F6B5E', ...NUM }}><span>{hint[0]}</span><span>{hint[1]}</span></div>
    </div>
  )
}

function Calculator(props) {
  const { eyebrow, title, subtitle, currency, minAmount, maxAmount, disclaimer, ctaLabel, ctaHref } = props
  const min = Math.max(1000, Number(minAmount) || 5000)
  const max = Math.max(min + 1000, Number(maxAmount) || 500000)
  const uid = useId()
  const [amount, setAmount] = useState(() => clamp(Number(props.defaultAmount) || 100000, min, max))
  const [term, setTerm] = useState(() => clamp(Number(props.defaultTerm) || 36, 6, 120))
  const [rate, setRate] = useState(() => clamp(Number(props.defaultRate) || 14.9, 1, 60))
  const safeAmount = clamp(amount, min, max)
  const { monthly, total, interest } = calculateLoan(safeAmount, term, rate)
  const interestShare = total > 0 ? (interest / total) * 100 : 0
  const termLabel = term % 12 === 0 ? `${term / 12} ${term === 12 ? 'año' : 'años'}` : `${term} meses`
  return (
    <section style={{ padding: 'clamp(56px, 7vw, 96px) 24px', background: '#F6FBF8', fontFamily: 'var(--runly-font-sans)' }}>
      <style>{STYLE}</style>
      <div style={{ maxWidth: '1100px', marginInline: 'auto' }}>
        <div style={{ maxWidth: '640px', marginBottom: '40px' }}>
          {eyebrow && <p style={{ margin: '0 0 10px', color: '#0F6B4B', fontSize: '13px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{eyebrow}</p>}
          {title && <h2 style={{ margin: 0, color: '#0B2E22', fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-.03em' }}>{title}</h2>}
          {subtitle && <p style={{ margin: '14px 0 0', color: '#3F5B4E', fontSize: '17px', lineHeight: 1.65 }}>{subtitle}</p>}
        </div>
        <div className="fin-calc-grid">
          <form onSubmit={(event) => event.preventDefault()} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'clamp(24px, 3vw, 40px)', borderRadius: '28px', background: '#fff', boxShadow: '0 30px 60px -30px rgba(11,61,46,.25), 0 0 0 1px rgba(23,131,94,.1)' }}>
            <Slider id={`${uid}-amount`} label="Monto del préstamo" value={safeAmount} min={min} max={max} step={1000} display={finMoney(safeAmount, currency, 0)} onChange={setAmount} hint={[finMoney(min, currency, 0), finMoney(max, currency, 0)]} />
            <Slider id={`${uid}-term`} label="Plazo" value={term} min={6} max={120} step={6} display={termLabel} onChange={setTerm} hint={['6 meses', '10 años']} />
            <Slider id={`${uid}-rate`} label="Tasa de interés anual" value={rate} min={1} max={60} step={0.1} display={`${rate.toFixed(1)}%`} onChange={setRate} hint={['1%', '60%']} />
          </form>
          <div style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '24px', padding: 'clamp(24px, 3vw, 40px)', borderRadius: '28px', color: '#fff', background: 'linear-gradient(150deg,#0F6B4B 0%,#083A2A 100%)', boxShadow: '0 30px 60px -24px rgba(8,58,42,.6)' }}>
            <div aria-hidden="true" style={{ position: 'absolute', right: '-80px', top: '-80px', width: '260px', height: '260px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(123,224,178,.35), transparent)' }} />
            <div role="status" aria-live="polite" aria-atomic="true" style={{ position: 'relative' }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Pago mensual estimado</div>
              <div style={{ margin: '6px 0 4px', fontSize: 'clamp(40px, 5vw, 58px)', fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1, ...NUM }}>{finMoney(monthly, currency, 0)}</div>
              <div style={{ fontSize: '14px' }}>durante {termLabel}</div>
              <div style={{ margin: '26px 0 8px', height: '10px', borderRadius: '99px', background: '#7BE0B2', overflow: 'hidden' }} aria-hidden="true"><div style={{ width: `${interestShare}%`, height: '100%', background: '#04231A', transition: 'width .3s ease' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontSize: '13px' }}>
                <span><span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: '#7BE0B2', marginRight: '6px' }} />Capital {finMoney(safeAmount, currency, 0)}</span>
                <span><span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: '#04231A', marginRight: '6px', border: '1px solid #7BE0B2' }} />Intereses {finMoney(interest, currency, 0)}</span>
              </div>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', margin: '24px 0 0', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,.25)' }}>
                <div><dt style={{ fontSize: '13px' }}>Intereses totales</dt><dd style={{ margin: '2px 0 0', fontSize: '22px', fontWeight: 800, ...NUM }}>{finMoney(interest, currency, 0)}</dd></div>
                <div><dt style={{ fontSize: '13px' }}>Pago total</dt><dd style={{ margin: '2px 0 0', fontSize: '22px', fontWeight: 800, ...NUM }}>{finMoney(total, currency, 0)}</dd></div>
              </dl>
            </div>
            <div style={{ position: 'relative' }}>
              {ctaLabel && <a href={ctaHref || '#'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '52px', borderRadius: '999px', background: '#fff', color: '#083A2A', fontWeight: 800, fontSize: '16px', textDecoration: 'none' }}>{ctaLabel}</a>}
              {disclaimer && <p style={{ margin: '12px 0 0', fontSize: '12px', lineHeight: 1.5 }}>{disclaimer}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export const FinCalculatorBlock = defineBlock({
  type: 'FinCalculatorBlock',
  label: 'Calculadora de préstamo',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Calcula tu pago', title: 'Planea tu préstamo en segundos',
    subtitle: 'Ajusta monto, plazo y tasa para ver cuánto pagarías cada mes. Es una estimación sin compromiso.',
    defaultAmount: 100000, defaultTerm: 36, defaultRate: 14.9, minAmount: 5000, maxAmount: 500000, currency: 'MXN',
    ctaLabel: 'Solicitar este préstamo', ctaHref: '/contacto',
    disclaimer: 'Cálculo informativo con tasa fija; la oferta final depende de tu perfil crediticio.',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, subtitle: { type: 'textarea', label: 'Descripción' },
    defaultAmount: { type: 'number', label: 'Monto inicial' }, defaultTerm: { type: 'number', label: 'Plazo inicial (meses)' }, defaultRate: { type: 'number', label: 'Tasa anual inicial (%)' },
    minAmount: { type: 'number', label: 'Monto mínimo' }, maxAmount: { type: 'number', label: 'Monto máximo' },
    currency: { type: 'select', label: 'Moneda', options: [{ value: 'MXN', label: 'Peso mexicano (MXN)' }, { value: 'USD', label: 'Dólar (USD)' }, { value: 'EUR', label: 'Euro (EUR)' }] },
    ctaLabel: { type: 'text', label: 'Botón' }, ctaHref: { type: 'link', label: 'Enlace del botón' }, disclaimer: { type: 'textarea', label: 'Aviso legal' },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'subtitle', 'ctaLabel', 'ctaHref', 'disclaimer'] },
    { label: 'Valores iniciales', fields: ['defaultAmount', 'defaultTerm', 'defaultRate'] },
    { label: 'Límites', fields: ['minAmount', 'maxAmount', 'currency'] },
  ],
  render: (props) => <Calculator {...props} />,
})
