import { useId } from 'react'
import { Icon, safeHref } from './blockKit.jsx'

// Shared look of the "Aura" template: liquid glass over a bright sky. Glass = translucent fill + backdrop blur and
// saturation + a specular rim (inset highlights) + a sheen that sweeps across + a highlight that follows the pointer.
// Scenes are inline SVG; nothing is loaded from the network. All motion stops under reduced motion.
export const C = {
  blue: 'var(--atlas-color-primary, #0A66E8)', blueHex: '#0A66E8', sky: '#2F8BFF', ice: '#EAF4FF', mist: '#F5F9FF', cyan: '#5CE1E6', violet: '#8B7CFF',
  ink: '#0B1B33', muted: '#56688A', line: 'rgba(255,255,255,.6)', white: '#FFFFFF',
}
export const SANS = "var(--atlas-font-sans, 'DM Sans', Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif)"
export const WRAP = { maxWidth: '1200px', marginInline: 'auto', padding: '0 clamp(18px, 4vw, 40px)' }

export const CR_CSS = `
.cr,.cr *{box-sizing:border-box}
.cr{font-family:${SANS};color:${C.ink};-webkit-font-smoothing:antialiased}
.cr a:focus-visible,.cr button:focus-visible,.cr summary:focus-visible{outline:3px solid ${C.blueHex};outline-offset:3px;border-radius:12px}
.cr-glass{position:relative;isolation:isolate;overflow:hidden;background:linear-gradient(140deg,rgba(255,255,255,.62),rgba(255,255,255,.22));-webkit-backdrop-filter:blur(22px) saturate(180%);backdrop-filter:blur(22px) saturate(180%);border:1px solid rgba(255,255,255,.7);box-shadow:inset 0 1px 1px rgba(255,255,255,.95),inset 0 -10px 24px -14px rgba(255,255,255,.7),0 24px 60px -28px rgba(20,70,150,.45)}
.cr-glass::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(320px circle at calc(var(--mx,.3)*100%) calc(var(--my,.1)*100%),rgba(255,255,255,.75),transparent 55%);opacity:.8;transition:opacity .3s}
.cr-glass::after{content:"";position:absolute;inset:-40% -60%;z-index:-1;pointer-events:none;background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,.55) 50%,transparent 58%);transform:translateX(-60%)}
.cr-glass.dark{background:linear-gradient(140deg,rgba(18,40,80,.55),rgba(18,40,80,.25));border-color:rgba(255,255,255,.22);color:#fff;box-shadow:inset 0 1px 1px rgba(255,255,255,.35),0 24px 60px -28px rgba(5,20,50,.7)}
.cr-glass.dark::before{background:radial-gradient(320px circle at calc(var(--mx,.3)*100%) calc(var(--my,.1)*100%),rgba(255,255,255,.18),transparent 55%)}
.cr-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 22px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none;cursor:pointer;border:0;transition:transform .25s cubic-bezier(.3,1.3,.5,1),box-shadow .3s ease}
.cr-btn svg{transition:transform .25s ease}
.cr-btn:hover{transform:translateY(-2px) scale(1.02)}
.cr-btn:hover svg{transform:translateX(4px)}
.cr-btn.solid{color:#fff;background:linear-gradient(180deg,#4AA3FF 0%,${C.blueHex} 70%);box-shadow:inset 0 1px 1px rgba(255,255,255,.6),inset 0 -6px 14px rgba(0,40,120,.25),0 12px 30px -8px rgba(10,102,232,.7),0 0 0 6px rgba(47,139,255,.14)}
.cr-btn.solid:hover{box-shadow:inset 0 1px 1px rgba(255,255,255,.6),inset 0 -6px 14px rgba(0,40,120,.25),0 16px 40px -8px rgba(10,102,232,.85),0 0 0 9px rgba(47,139,255,.16)}
.cr-btn.glass{color:${C.ink};background:rgba(255,255,255,.55);-webkit-backdrop-filter:blur(14px) saturate(170%);backdrop-filter:blur(14px) saturate(170%);border:1px solid rgba(255,255,255,.8);box-shadow:inset 0 1px 1px #fff,0 10px 26px -14px rgba(20,70,150,.45)}
.cr-btn.white{color:${C.ink};background:#fff;box-shadow:0 10px 26px -12px rgba(0,0,0,.35)}
.cr-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;border-radius:999px;font-size:13px;font-weight:600;color:${C.muted}}
.cr-pill b{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:${C.ice};color:${C.blueHex};font-size:12px}
.cr-eyebrow{margin:0;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:${C.blueHex}}
.cr-h2{margin:12px 0 0;font-size:clamp(30px,3.8vw,48px);font-weight:600;letter-spacing:-.035em;line-height:1.08}
.cr-lead{margin:16px 0 0;font-size:clamp(16px,1.4vw,18px);line-height:1.7;color:${C.muted}}
.cr-grad{background:linear-gradient(92deg,#1E7BFF,#33B4FF 60%,#1E7BFF);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
@keyframes cr-sheen{0%,70%{transform:translateX(-60%)}100%{transform:translateX(60%)}}
@keyframes cr-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
@keyframes cr-drift{from{transform:translateX(-12%)}to{transform:translateX(125%)}}
@keyframes cr-spin{to{transform:rotate(360deg)}}
@keyframes cr-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes cr-blob{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(8%,-10%) scale(1.15)}66%{transform:translate(-8%,6%) scale(.9)}}
@keyframes cr-gradtext{to{background-position:-200% 0}}
@keyframes cr-rise{from{transform:translateY(60px)}to{transform:translateY(0)}}
@keyframes cr-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes cr-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-4px)}}
@keyframes cr-marquee{to{transform:translateX(-50%)}}
@keyframes cr-marquee-r{from{transform:translateX(-50%)}to{transform:translateX(0)}}
@keyframes cr-ring{from{stroke-dashoffset:var(--len,200)}}
@keyframes cr-ripple{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@media (prefers-reduced-motion:no-preference){
.cr-glass::after{animation:cr-sheen 7s ease-in-out infinite;animation-delay:var(--sheen,0s)}
.cr-float{animation:cr-float 7s ease-in-out infinite}
.cr-breathe{animation:cr-breathe 4s ease-in-out infinite}
.cr-spin{animation:cr-spin 10s linear infinite}
.cr-blob{animation:cr-blob 18s ease-in-out infinite}
.cr-grad{animation:cr-gradtext 6s linear infinite}
.cr svg .cr-cloud{animation:cr-drift linear infinite}
.cr-ripple{animation:cr-ripple 2.4s ease-out infinite}
.cr-rv{transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1),filter .9s ease;transition-delay:calc(var(--i,0)*110ms)}
[data-rv="wait"] .cr-rv{opacity:0;transform:translateY(30px) scale(.98);filter:blur(8px)}
[data-rv="wait"] .cr-rv.up{transform:translateY(80px)}
}
@media (prefers-reduced-motion:reduce){.cr *,.cr,.cr *::before,.cr *::after{animation:none!important;transition:none!important}}
`
export const CrStyle = () => <style>{CR_CSS}</style>

export const Btn = ({ href, children, variant = 'solid', icon = 'arrow' }) => (children
  ? <a className={`cr-btn ${variant}`} href={safeHref(href)}>{children}{icon && <Icon name={icon} size={17} stroke={2.4} />}</a>
  : null)

// Soft colour blobs that drift behind glass sections, so the blur always has something to refract.
export const Blobs = ({ tone = 'day' }) => {
  const colors = tone === 'night' ? ['#2F6BFF', '#7B5CFF', '#00C2D1'] : ['#9FD0FF', '#C9B8FF', '#A6F0F2']
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {[[-8, 6, 46, 0], [58, -10, 40, -6], [30, 52, 44, -12]].map(([left, top, size, delay], index) => (
        <div key={index} className="cr-blob" style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, width: `${size}vw`, maxWidth: '620px', aspectRatio: '1', borderRadius: '50%', background: colors[index], filter: 'blur(60px)', opacity: tone === 'night' ? 0.55 : 0.75, animationDelay: `${delay}s` }} />
      ))}
    </div>
  )
}

export const Section = ({ children, bg = C.mist, pad = 'clamp(64px, 8vw, 110px)', blobs, innerRef, rv, style, id }) => (
  <section id={id} ref={innerRef} data-rv={rv} className="cr" style={{ position: 'relative', overflow: 'hidden', background: bg, padding: `${pad} 0`, ...style }}>
    <CrStyle />
    {blobs && <Blobs tone={blobs} />}
    <div style={{ ...WRAP, position: 'relative' }}>{children}</div>
  </section>
)

export const Heading = ({ eyebrow, title, highlight, lead, light = false, center = true }) => (
  <div style={{ textAlign: center ? 'center' : 'left', maxWidth: center ? '760px' : 'none', marginInline: center ? 'auto' : 0 }}>
    {eyebrow && <p className="cr-eyebrow cr-rv" style={light ? { color: C.cyan } : undefined}>{eyebrow}</p>}
    <h2 className="cr-h2 cr-rv" style={{ '--i': 1, color: light ? '#fff' : C.ink }}>{title}{highlight && <> <span className="cr-grad">{highlight}</span></>}</h2>
    {lead && <p className="cr-lead cr-rv" style={{ '--i': 2, color: light ? 'rgba(255,255,255,.75)' : C.muted }}>{lead}</p>}
  </div>
)

// ---------------------------------------------------------------------------------------------------------------
// Landscape seen through glass: sky, sun haze, drifting clouds, two mountain ranges and a meadow. Layers move at
// different speeds with --sy (set by useScrollVar on an ancestor) for depth.
export function SkyScene({ height = '100%', clouds = 6 }) {
  const id = useId().replace(/:/g, '')
  const layer = (factor) => ({ transform: `translateY(calc(var(--sy, 0) * ${factor}px))` })
  return (
    <svg aria-hidden="true" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3E95F0" /><stop offset=".55" stopColor="#A9D2FA" /><stop offset="1" stopColor="#E8F4FF" /></linearGradient>
        <radialGradient id={`${id}h`} cx="70%" cy="20%" r="40%"><stop offset="0" stopColor="#FFFFFF" stopOpacity=".85" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}m1`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7E98BC" /><stop offset="1" stopColor="#9DB4D2" /></linearGradient>
        <linearGradient id={`${id}m2`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5D7397" /><stop offset="1" stopColor="#7F95B6" /></linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8DB86A" /><stop offset=".5" stopColor="#6E9F4E" /><stop offset="1" stopColor="#4F7F37" /></linearGradient>
        <filter id={`${id}b`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <rect width="1600" height="900" fill={`url(#${id}s)`} />
      <rect width="1600" height="900" fill={`url(#${id}h)`} />
      <g style={layer(0.08)} filter={`url(#${id}b)`} fill="#FFFFFF">
        {Array.from({ length: clouds }, (_, index) => {
          const y = 80 + (index * 67) % 260, s = 0.6 + ((index * 37) % 50) / 60
          return (
            <g key={index} className="cr-cloud" style={{ animationDuration: `${70 + index * 17}s`, animationDelay: `${-index * 23}s` }}>
              <g transform={`translate(${-260} ${y}) scale(${s})`} opacity={0.75 + (index % 3) * 0.08}>
                <ellipse cx="80" cy="40" rx="80" ry="26" /><ellipse cx="130" cy="26" rx="54" ry="30" /><ellipse cx="60" cy="24" rx="40" ry="22" /><ellipse cx="170" cy="42" rx="50" ry="18" />
              </g>
            </g>
          )
        })}
      </g>
      <g style={layer(0.16)}>
        <path d="M0 560 L120 500 L210 530 L330 440 L420 500 L520 430 L610 470 L700 410 L780 455 L880 400 L990 470 L1090 420 L1180 480 L1300 430 L1400 490 L1500 450 L1600 500 V700 H0 Z" fill={`url(#${id}m1)`} />
        <path d="M330 440 L360 462 L388 455 L420 500 L400 470 L372 476 Z M700 410 L728 432 L752 428 L780 455 L760 445 L735 448 Z M880 400 L915 428 L945 420 L990 470 L960 445 L930 450 Z M1300 430 L1330 450 L1360 446 L1400 490 L1370 466 L1340 468 Z" fill="#F4F8FC" opacity=".9" />
      </g>
      <g style={layer(0.24)}>
        <path d="M0 610 L160 560 L300 600 L460 540 L620 600 L800 550 L960 610 L1120 560 L1300 610 L1460 570 L1600 600 V720 H0 Z" fill={`url(#${id}m2)`} opacity=".9" />
      </g>
      <g style={layer(0.36)}>
        <path d="M0 640 C300 610 600 650 900 630 C1200 612 1400 640 1600 628 V900 H0 Z" fill={`url(#${id}g)`} />
        <path d="M0 700 C400 680 800 720 1600 690" stroke="#A7CC7F" strokeWidth="3" opacity=".5" fill="none" />
      </g>
    </svg>
  )
}

// Iridescent orb: a spinning conic gradient under a glossy highlight, with ripples.
export const Orb = ({ size = 90 }) => (
  <div aria-hidden="true" style={{ position: 'relative', width: size, height: size }}>
    <span className="cr-ripple" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255,255,255,.7)' }} />
    <span className="cr-ripple" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(255,255,255,.5)', animationDelay: '1.2s' }} />
    <div className="cr-breathe" style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', boxShadow: '0 10px 40px rgba(60,140,255,.7), inset 0 0 20px rgba(255,255,255,.6)' }}>
      <div className="cr-spin" style={{ position: 'absolute', inset: '-25%', background: 'conic-gradient(from 0deg, #5CE1E6, #8B7CFF, #FF8AD8, #FFD27A, #5CE1E6)', filter: 'blur(10px)' }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,.95), rgba(255,255,255,0) 38%), radial-gradient(circle at 70% 80%, rgba(255,255,255,.35), transparent 40%)' }} />
    </div>
  </div>
)

// Phone mockup in CSS with a glass UI: header, topic chips (one active) and the orb.
export function Phone({ title, topics, active }) {
  return (
    <div style={{ position: 'relative', width: 'min(300px, 72vw)', aspectRatio: '9 / 18.5', borderRadius: '46px', padding: '10px', background: 'linear-gradient(145deg,#2B3442,#0E131B)', boxShadow: '0 50px 90px -30px rgba(10,40,100,.6), inset 0 0 0 2px rgba(255,255,255,.12)' }}>
      <div style={{ position: 'relative', height: '100%', borderRadius: '37px', overflow: 'hidden', background: 'linear-gradient(180deg,#5AAEFF 0%,#2F8BFF 45%,#1D6FE8 100%)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 85%, rgba(255,255,255,.45), transparent 45%)' }} />
        <div style={{ position: 'absolute', top: '10px', left: '50%', translate: '-50% 0', width: '34%', height: '24px', borderRadius: '999px', background: '#0B0F15' }} />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '14px 22px 0', fontSize: '12px', fontWeight: 700, color: '#fff' }}><span>9:41</span><span aria-hidden="true">●●●</span></div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '10px', padding: '22px 16px 0', color: '#fff' }}>
          <span className="cr-glass" style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,.22)', borderColor: 'rgba(255,255,255,.4)' }}><Icon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} /></span>
          <strong style={{ flex: 1, fontSize: '15px' }}>{title}</strong>
          <span className="cr-glass" style={{ display: 'grid', placeItems: 'center', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,.22)', borderColor: 'rgba(255,255,255,.4)' }}><Icon name="mic" size={16} /></span>
        </div>
        <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', padding: '26px 14px 0' }}>
          {topics.map((topic, index) => (
            <span key={topic} className="cr-float" style={{ animationDelay: `${-index * 0.9}s`, animationDuration: `${5 + (index % 3)}s`, padding: '8px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, color: topic === active ? C.ink : '#fff', background: topic === active ? '#fff' : 'rgba(255,255,255,.2)', border: '1px solid rgba(255,255,255,.45)', boxShadow: topic === active ? '0 8px 20px -8px rgba(0,0,0,.35)' : 'inset 0 1px 1px rgba(255,255,255,.5)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}>{topic}</span>
          ))}
        </div>
        <div style={{ position: 'absolute', left: '50%', bottom: '14%', translate: '-50% 0' }}><Orb size={78} /></div>
      </div>
    </div>
  )
}

export const Stars = ({ count = 5 }) => (
  <span aria-label={`${count} de 5 estrellas`} style={{ display: 'inline-flex', gap: '2px', color: '#FFB020' }}>
    {Array.from({ length: 5 }, (_, index) => <svg key={index} aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill={index < count ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>)}
  </span>
)
