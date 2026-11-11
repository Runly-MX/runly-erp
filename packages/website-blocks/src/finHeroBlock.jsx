import { useEffect, useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'

const CURRENCIES = [{ value: 'MXN', label: 'Peso mexicano (MXN)' }, { value: 'USD', label: 'Dólar (USD)' }, { value: 'EUR', label: 'Euro (EUR)' }]
export const finMoney = (value, currency, digits = 2) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: CURRENCIES.some((c) => c.value === currency) ? currency : 'MXN', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' }
const GREEN_DEEP = '#0B4F39'
const STYLE = `
@keyframes fin-rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes fin-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes fin-draw{from{stroke-dashoffset:260}to{stroke-dashoffset:0}}
.fin-hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:56px;align-items:center}
.fin-float-a{animation:fin-float 7s ease-in-out infinite}.fin-float-b{animation:fin-float 9s ease-in-out -3s infinite}
.fin-row{animation:fin-rise .7s cubic-bezier(.2,.7,.2,1) backwards}
.fin-spark{stroke-dasharray:260;animation:fin-draw 1.6s ease-out .3s backwards}
.fin-btn{transition:transform .2s ease,box-shadow .2s ease}.fin-btn:hover{transform:translateY(-2px)}.fin-btn:focus-visible{outline:3px solid ${GREEN_DEEP};outline-offset:3px}
@media (max-width:900px){.fin-hero-grid{grid-template-columns:1fr;gap:40px}}
@media (max-width:520px){.fin-loan-card{left:-6px!important;width:200px!important}.fin-side-card{right:-6px!important}}
@media (prefers-reduced-motion:reduce){.fin-float-a,.fin-float-b,.fin-row,.fin-spark{animation:none!important}.fin-btn{transition:none}}`

// "Name | Category | amount" per line; a positive amount is income.
export function parseTransactions(raw) {
  if (typeof raw !== 'string') return []
  return raw.split('\n').map((row) => row.trim()).filter(Boolean).map((row) => {
    const [name = '', category = '', amount = '0'] = row.split('|').map((part) => part.trim())
    const value = Number(amount.replace(/[^0-9.+-]/g, ''))
    return { name, category, value: Number.isFinite(value) ? value : 0 }
  }).filter((tx) => tx.name).slice(0, 5)
}

function useCountUp(target, duration = 1400) {
  const [value, setValue] = useState(target)
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    let raf
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      setValue(target * (1 - (1 - p) ** 3))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    setValue(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

export const FinIcon = ({ d, size = 16, stroke = 'currentColor', width = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)
const ICONS = { send: 'M5 12h14M13 6l6 6-6 6', receive: 'M19 12H5M11 6l-6 6 6 6', pay: 'M3 7h18v10H3zM3 11h18', check: 'M5 13l4 4L19 7', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' }

function Phone({ balanceLabel, balance, currency, transactions, loanTitle, loanAmount, loanNote }) {
  const shown = useCountUp(Number(balance) || 0)
  const txs = parseTransactions(transactions)
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: 'min(100%, 330px)', marginInline: 'auto', paddingBlock: '24px' }}>
      <div style={{ position: 'absolute', inset: '-30px -60px', background: 'radial-gradient(closest-side, rgba(23,131,94,.22), transparent 70%)', filter: 'blur(8px)' }} />
      <div className="fin-float-a" style={{ position: 'relative', borderRadius: '44px', padding: '10px', background: 'linear-gradient(145deg,#12372B,#05140F)', boxShadow: '0 40px 80px -20px rgba(11,61,46,.45), 0 0 0 1.5px rgba(255,255,255,.08) inset' }}>
        <div style={{ borderRadius: '35px', overflow: 'hidden', background: '#F6FBF8', padding: '14px 16px 18px', fontFamily: 'var(--runly-font-sans)', minHeight: '560px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: 700, color: '#0B2E22', ...NUM }}>
            <span>9:41</span><span style={{ width: '70px', height: '20px', borderRadius: '99px', background: '#05140F' }} /><span>5G</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0 14px' }}>
            <span style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg,#17835E,#0B4F39)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '13px' }}>S</span>
            <div><div style={{ fontSize: '11px', color: '#4F6B5E' }}>Buenos días</div><div style={{ fontSize: '14px', fontWeight: 800, color: '#0B2E22' }}>Sofía Ramírez</div></div>
          </div>
          <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '22px', padding: '18px', color: '#fff', background: 'linear-gradient(140deg,#17835E 0%,#0B4F39 100%)', boxShadow: '0 14px 28px -10px rgba(11,79,57,.6)' }}>
            <div style={{ position: 'absolute', right: '-30px', top: '-40px', width: '140px', height: '140px', borderRadius: '50%', background: 'rgba(255,255,255,.1)' }} />
            <div style={{ position: 'relative', fontSize: '12px' }}>{balanceLabel}</div>
            <div style={{ position: 'relative', margin: '4px 0 6px', fontSize: '29px', fontWeight: 800, letterSpacing: '-.02em', ...NUM }}>{finMoney(shown, currency)}</div>
            <div style={{ position: 'relative', display: 'inline-flex', gap: '4px', alignItems: 'center', padding: '3px 9px', borderRadius: '99px', background: 'rgba(255,255,255,.18)', fontSize: '11px', fontWeight: 700 }}><FinIcon d="M7 17L17 7M9 7h8v8" size={11} />+2.4% este mes</div>
            <svg viewBox="0 0 220 56" style={{ position: 'relative', display: 'block', width: '100%', height: '48px', marginTop: '10px' }} fill="none">
              <path className="fin-spark" d="M2 46 C22 40 30 22 52 28 S84 50 106 34 S140 8 164 20 S200 14 218 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ display: 'flex', gap: '10px', margin: '16px 0 14px' }}>
            {[['send', 'Enviar'], ['receive', 'Recibir'], ['pay', 'Pagar']].map(([key, label]) => (
              <div key={key} style={{ flex: 1, textAlign: 'center', fontSize: '10px', fontWeight: 700, color: '#0B2E22' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: '38px', height: '38px', margin: '0 auto 4px', borderRadius: '14px', background: '#fff', color: '#0F6B4B', boxShadow: '0 2px 8px rgba(11,46,34,.08)' }}><FinIcon d={ICONS[key]} size={17} /></span>{label}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 800, color: '#0B2E22', margin: '0 0 8px' }}>Movimientos recientes</div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {txs.map((tx, index) => (
              <div key={`${tx.name}-${index}`} className="fin-row" style={{ animationDelay: `${0.5 + index * 0.12}s`, display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 11px', borderRadius: '14px', background: '#fff', boxShadow: '0 1px 3px rgba(11,46,34,.06)' }}>
                <span style={{ width: '30px', height: '30px', flex: 'none', borderRadius: '10px', background: tx.value >= 0 ? '#D9F2E6' : '#EEF3F0', color: '#0F6B4B', display: 'grid', placeItems: 'center', fontSize: '12px', fontWeight: 800 }}>{tx.name.charAt(0)}</span>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0B2E22', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.name}</span><span style={{ display: 'block', fontSize: '10px', color: '#4F6B5E' }}>{tx.category}</span></span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: tx.value >= 0 ? '#0F6B4B' : '#0B2E22', ...NUM }}>{tx.value >= 0 ? '+' : '-'}{finMoney(Math.abs(tx.value), currency, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="fin-loan-card fin-float-b" style={{ position: 'absolute', left: '-72px', bottom: '0px', width: '230px', padding: '14px 16px', borderRadius: '20px', background: 'rgba(255,255,255,.9)', backdropFilter: 'blur(14px)', boxShadow: '0 24px 48px -16px rgba(11,61,46,.35), 0 0 0 1px rgba(23,131,94,.12)', fontFamily: 'var(--runly-font-sans)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 800, color: '#0F6B4B' }}><span style={{ display: 'grid', placeItems: 'center', width: '22px', height: '22px', borderRadius: '50%', background: '#D9F2E6' }}><FinIcon d={ICONS.check} size={12} /></span>{loanTitle}</div>
        <div style={{ margin: '8px 0 2px', fontSize: '24px', fontWeight: 800, letterSpacing: '-.02em', color: '#0B2E22', ...NUM }}>{loanAmount}</div>
        <div style={{ fontSize: '11px', color: '#4F6B5E' }}>{loanNote}</div>
        <div style={{ height: '6px', borderRadius: '99px', background: '#D9F2E6', marginTop: '10px', overflow: 'hidden' }}><div style={{ width: '72%', height: '100%', borderRadius: '99px', background: 'linear-gradient(90deg,#17835E,#34B07F)' }} /></div>
      </div>
      <div className="fin-side-card fin-float-b" style={{ position: 'absolute', right: '-44px', top: '70px', padding: '10px 14px', borderRadius: '16px', background: '#0B3D2E', color: '#fff', boxShadow: '0 20px 40px -14px rgba(5,20,15,.6)', fontFamily: 'var(--runly-font-sans)', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <FinIcon d={ICONS.shield} size={18} stroke="#7BE0B2" /><span style={{ fontSize: '11px', fontWeight: 700, lineHeight: 1.25 }}>Protegido<br />256-bit</span>
      </div>
    </div>
  )
}

const btn = (solid) => ({
  display: 'inline-flex', alignItems: 'center', minHeight: '48px', padding: '0 28px', borderRadius: '999px', fontWeight: 700, fontSize: '15px', textDecoration: 'none',
  background: solid ? '#0F6B4B' : 'transparent', color: solid ? '#fff' : GREEN_DEEP,
  border: solid ? '2px solid transparent' : `2px solid ${GREEN_DEEP}`, boxShadow: solid ? '0 12px 24px -10px rgba(15,107,75,.7)' : 'none',
})

function Hero(props) {
  const { eyebrow, title, highlight, subtitle, ctaLabel, ctaHref, ctaSecondLabel, ctaSecondHref, trust } = props
  const trustItems = String(trust || '').split('|').map((item) => item.trim()).filter(Boolean)
  return (
    <section style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(32px, 5vw, 64px) 24px clamp(40px, 6vw, 80px)', background: 'linear-gradient(180deg,#E3F5EC 0%,#F6FBF8 100%)' }}>
      <style>{STYLE}</style>
      <div aria-hidden="true" style={{ position: 'absolute', left: '-120px', top: '-80px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(52,176,127,.28), transparent)' }} />
      <div className="fin-hero-grid" style={{ position: 'relative', maxWidth: '1200px', marginInline: 'auto', fontFamily: 'var(--runly-font-sans)' }}>
        <div>
          {eyebrow && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '99px', background: 'rgba(255,255,255,.8)', border: '1px solid rgba(23,131,94,.25)', color: GREEN_DEEP, fontSize: '13px', fontWeight: 700 }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#17835E' }} />{eyebrow}</span>}
          <h1 style={{ margin: '22px 0 0', color: '#0B2E22', fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-.035em' }}>
            {title}{highlight && <> <span style={{ color: '#0F6B4B', background: 'linear-gradient(transparent 68%, rgba(52,176,127,.35) 68%)' }}>{highlight}</span></>}
          </h1>
          {subtitle && <p style={{ margin: '24px 0 0', maxWidth: '520px', color: '#3F5B4E', fontSize: 'clamp(17px, 1.5vw, 19px)', lineHeight: 1.65 }}>{subtitle}</p>}
          {(ctaLabel || ctaSecondLabel) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '32px' }}>
              {ctaLabel && <a className="fin-btn" href={ctaHref || '#'} style={btn(true)}>{ctaLabel}</a>}
              {ctaSecondLabel && <a className="fin-btn" href={ctaSecondHref || '#'} style={btn(false)}>{ctaSecondLabel}</a>}
            </div>
          )}
          {trustItems.length > 0 && (
            <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', margin: '34px 0 0', padding: 0, listStyle: 'none', color: '#2F4A3E', fontSize: '14px', fontWeight: 600 }}>
              {trustItems.map((item) => <li key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}><span style={{ color: '#0F6B4B', display: 'inline-flex' }}><FinIcon d={ICONS.check} size={15} /></span>{item}</li>)}
            </ul>
          )}
        </div>
        <Phone {...props} />
      </div>
    </section>
  )
}

export const FinHeroBlock = defineBlock({
  type: 'FinHeroBlock',
  label: 'Hero fintech con teléfono',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Tu aliado financiero de confianza', title: 'Una banca mejor para', highlight: 'un futuro más brillante',
    subtitle: 'Administra tu dinero, solicita el crédito ideal y alcanza tus metas desde una sola app, con tasas claras y sin comisiones ocultas.',
    ctaLabel: 'Explorar préstamos', ctaHref: '/prestamos', ctaSecondLabel: 'Cómo funciona', ctaSecondHref: '/como-funciona',
    trust: 'Sin comisiones ocultas | Aprobación en 24 horas | Datos protegidos',
    balanceLabel: 'Saldo disponible', balance: 24580.5, currency: 'MXN',
    transactions: 'Nómina Acme | Ingreso | +18500\nSupermercado | Compras | -842.3\nTransferencia a Luis | Envío | -1200\nPago de crédito | Préstamo | -2150',
    loanTitle: 'Préstamo aprobado', loanAmount: '$150,000', loanNote: 'Pago mensual desde $4,820',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' }, title: { type: 'text', label: 'Título' }, highlight: { type: 'text', label: 'Título resaltado' },
    subtitle: { type: 'textarea', label: 'Descripción' },
    ctaLabel: { type: 'text', label: 'Botón principal' }, ctaHref: { type: 'link', label: 'Enlace principal' },
    ctaSecondLabel: { type: 'text', label: 'Botón secundario' }, ctaSecondHref: { type: 'link', label: 'Enlace secundario' },
    trust: { type: 'text', label: 'Garantías (separadas por |)' },
    balanceLabel: { type: 'text', label: 'Etiqueta del saldo' }, balance: { type: 'number', label: 'Saldo de ejemplo' },
    currency: { type: 'select', label: 'Moneda', options: CURRENCIES },
    transactions: { type: 'textarea', label: 'Movimientos (Nombre | Categoría | Monto, uno por línea)' },
    loanTitle: { type: 'text', label: 'Tarjeta flotante: título' }, loanAmount: { type: 'text', label: 'Tarjeta flotante: monto' }, loanNote: { type: 'text', label: 'Tarjeta flotante: nota' },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'highlight', 'subtitle', 'trust'] },
    { label: 'Botones', fields: ['ctaLabel', 'ctaHref', 'ctaSecondLabel', 'ctaSecondHref'] },
    { label: 'Teléfono', fields: ['balanceLabel', 'balance', 'currency', 'transactions'] },
    { label: 'Tarjeta flotante', fields: ['loanTitle', 'loanAmount', 'loanNote'] },
  ],
  render: (props) => <Hero {...props} />,
})
