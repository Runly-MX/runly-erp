import { useId } from 'react'
import { Icon, safeHref } from './blockKit.jsx'

// Shared art and motion for the "Impulsa" template (digital marketing agency): white canvas, deep green brand,
// pastel service cards and a dark forest band. Everything is inline SVG + CSS; no image files or external fonts.
// Motion is opt-in by JavaScript: content renders visible, and only after hydration do elements wait for the viewport,
// so a page without JS (or with reduced motion) never hides anything.
export const G = {
  green: 'var(--atlas-color-primary, #1F7A33)', greenHex: '#1F7A33', leaf: '#3FAE4F', lime: '#8FD99A', mint: '#EAF7EC', mintDeep: '#D3EFD8',
  forest: '#0F3B22', forest2: '#17552F', ink: '#0E1A12', muted: '#55635A', line: '#E3ECE5', white: '#FFFFFF', soft: '#F6FAF6',
  blue: '#EEF4FF', violet: '#F4F0FF', amber: '#FFF5E6', rose: '#FFEFF2',
}
export const SANS = "var(--atlas-font-sans, 'DM Sans', Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif)"
export const WRAP = { maxWidth: '1180px', marginInline: 'auto', padding: '0 clamp(18px, 4vw, 40px)' }
export { lines, cells, safeHref, useReveal, CountUp, usePointerVars, Icon, ICON_NAMES } from './blockKit.jsx'
export const IM_CSS = `
.im,.im *{box-sizing:border-box}
.im{font-family:${SANS};color:${G.ink};-webkit-font-smoothing:antialiased}
.im a:focus-visible,.im button:focus-visible,.im summary:focus-visible{outline:3px solid ${G.leaf};outline-offset:3px;border-radius:8px}
.im-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:12px;min-height:48px;padding:0 10px 0 22px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none;border:0;cursor:pointer;transition:transform .2s ease,box-shadow .25s ease,background .2s ease}
.im-btn .im-bi{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;transition:transform .25s cubic-bezier(.3,1.4,.5,1)}
.im-btn:hover{transform:translateY(-2px)}
.im-btn:hover .im-bi{transform:translateX(3px) rotate(-12deg)}
.im-btn:active{transform:translateY(0) scale(.98)}
.im-btn.solid{background:${G.green};color:#fff;box-shadow:0 10px 24px -10px rgba(31,122,51,.65)}
.im-btn.solid .im-bi{background:rgba(255,255,255,.22)}
.im-btn.solid::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transform:translateX(-120%);transition:transform .7s ease}
.im-btn.solid:hover::after{transform:translateX(120%)}
.im-btn.ghost{background:transparent;color:${G.ink};padding-left:14px}
.im-btn.ghost .im-bi{border:1.5px solid ${G.line};background:#fff}
.im-btn.light{background:#fff;color:${G.forest}}
.im-btn.light .im-bi{background:${G.mint}}
.im-btn.leaf{background:${G.leaf};color:${G.forest}}
.im-btn.leaf .im-bi{background:rgba(255,255,255,.35)}
.im-eyebrow{margin:0;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${G.green}}
.im-h2{margin:10px 0 0;font-size:clamp(28px,3.4vw,42px);font-weight:800;letter-spacing:-.03em;line-height:1.12}
.im-lead{margin:14px 0 0;font-size:clamp(16px,1.4vw,18px);line-height:1.7;color:${G.muted}}
.im-hl{background:linear-gradient(90deg,${G.greenHex},${G.leaf});-webkit-background-clip:text;background-clip:text;color:transparent}
@keyframes im-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes im-bob{0%,100%{transform:translate(0,0) rotate(0)}50%{transform:translate(4px,-14px) rotate(1.5deg)}}
@keyframes im-flame{0%,100%{transform:scaleY(1) scaleX(1)}25%{transform:scaleY(1.18) scaleX(.92)}50%{transform:scaleY(.9) scaleX(1.05)}75%{transform:scaleY(1.12) scaleX(.95)}}
@keyframes im-puff{0%{transform:scale(.6) translateY(10px);opacity:0}30%{opacity:1}100%{transform:scale(1.35) translateY(-6px);opacity:0}}
@keyframes im-draw{from{stroke-dashoffset:var(--len,300)}to{stroke-dashoffset:0}}
@keyframes im-dash{to{stroke-dashoffset:-40}}
@keyframes im-marquee{to{transform:translateX(-50%)}}
@keyframes im-orb{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,-30px) scale(1.12)}66%{transform:translate(-30px,20px) scale(.92)}}
@keyframes im-spin{to{transform:rotate(360deg)}}
@keyframes im-pop{0%{transform:scale(.4);opacity:0}70%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes im-plane{0%{transform:translate(-30px,18px) rotate(-8deg);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translate(60px,-30px) rotate(6deg);opacity:0}}
@keyframes im-pulse{0%{box-shadow:0 0 0 0 rgba(63,174,79,.55)}100%{box-shadow:0 0 0 14px rgba(63,174,79,0)}}
@keyframes im-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
@media (prefers-reduced-motion:no-preference){
.im-float{animation:im-float 6s ease-in-out infinite}
.im-bob{animation:im-bob 5.5s ease-in-out infinite}
.im svg .im-flame{transform-box:fill-box;transform-origin:50% 0;animation:im-flame .45s ease-in-out infinite}
.im svg .im-puff{transform-box:fill-box;transform-origin:center;animation:im-puff 3.2s ease-out infinite}
.im svg .im-trail{stroke-dasharray:6 8;animation:im-dash 1.6s linear infinite}
.im-orb{animation:im-orb 16s ease-in-out infinite}
.im-spin{animation:im-spin 18s linear infinite}
.im-plane{animation:im-plane 4.5s ease-in-out infinite}
.im-pulse{animation:im-pulse 2s ease-out infinite}
.im-rv{transition:opacity .75s cubic-bezier(.2,.7,.2,1),transform .75s cubic-bezier(.2,.7,.2,1);transition-delay:calc(var(--i,0)*110ms)}
[data-rv="wait"] .im-rv{opacity:0;transform:translateY(28px)}
[data-rv="wait"] .im-rv.l{transform:translateX(-36px)}
[data-rv="wait"] .im-rv.r{transform:translateX(36px)}
[data-rv="wait"] .im-rv.z{transform:scale(.9)}
[data-rv="in"] .im-draw{stroke-dasharray:var(--len,300);animation:im-draw 1.4s cubic-bezier(.4,.1,.2,1) both;animation-delay:calc(var(--i,0)*160ms + .2s)}
[data-rv="wait"] .im-draw{stroke-dasharray:var(--len,300);stroke-dashoffset:var(--len,300)}
[data-rv="in"] .im-popin{animation:im-pop .6s cubic-bezier(.3,1.4,.5,1) both;animation-delay:calc(var(--i,0)*160ms)}
}
@media (prefers-reduced-motion:reduce){.im *,.im{animation:none!important;transition:none!important}}
`
export const ImStyle = () => <style>{IM_CSS}</style>

export const Section = ({ children, bg = G.white, pad = 'clamp(56px, 7vw, 96px)', id, style, innerRef, rv }) => (
  <section id={id} ref={innerRef} data-rv={rv} className="im" style={{ position: 'relative', background: bg, padding: `${pad} 0`, ...style }}>
    <ImStyle />
    <div style={{ ...WRAP, position: 'relative' }}>{children}</div>
  </section>
)

export const Heading = ({ eyebrow, title, highlight, lead, center = true, light = false, as: Tag = 'h2' }) => (
  <div style={{ textAlign: center ? 'center' : 'left', maxWidth: center ? '720px' : 'none', marginInline: center ? 'auto' : 0 }}>
    {eyebrow && <p className="im-eyebrow im-rv" style={light ? { color: G.lime } : undefined}>{eyebrow}</p>}
    <Tag className="im-h2 im-rv" style={{ '--i': 1, color: light ? '#fff' : G.ink }}>{title}{highlight && <> <span className={light ? undefined : 'im-hl'} style={light ? { color: G.lime } : undefined}>{highlight}</span></>}</Tag>
    {lead && <p className="im-lead im-rv" style={{ '--i': 2, color: light ? 'rgba(255,255,255,.78)' : G.muted }}>{lead}</p>}
  </div>
)

export const Btn = ({ href, children, variant = 'solid', icon = 'arrow' }) => (children
  ? <a className={`im-btn ${variant}`} href={safeHref(href)}>{children}<span className="im-bi" aria-hidden="true"><Icon name={icon} size={16} stroke={2.4} /></span></a>
  : null)


// ---------------------------------------------------------------------------------------------------------------
// Hero scene: a rocket lifting off a cloud bank, with a dotted trail and a soft green halo.
export function RocketScene() {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 520 520" role="img" aria-label="Ilustración: un cohete despegando entre nubes" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <defs>
        <radialGradient id={`${id}h`} cx="50%" cy="45%" r="55%"><stop offset="0" stopColor={G.mintDeep} /><stop offset="1" stopColor={G.mint} stopOpacity="0" /></radialGradient>
        <linearGradient id={`${id}b`} x1="0" x2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".6" stopColor="#F1F5F2" /><stop offset="1" stopColor="#C9D6CD" /></linearGradient>
        <linearGradient id={`${id}f`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#5CCB6E" /><stop offset="1" stopColor="#1F7A33" /></linearGradient>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B9F5C2" /><stop offset=".55" stopColor="#5CCB6E" stopOpacity=".75" /><stop offset="1" stopColor="#5CCB6E" stopOpacity="0" /></linearGradient>
        <radialGradient id={`${id}c`} cx="40%" cy="35%" r="70%"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E3E9E5" /></radialGradient>
      </defs>
      <circle cx="290" cy="220" r="210" fill={`url(#${id}h)`} />
      <path className="im-trail" d="M70 300 C40 220 120 170 170 210 C215 245 150 300 120 255 C95 215 160 150 230 175" stroke={G.leaf} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".7" />
      <path d="M216 170 l16 6 -12 12" stroke={G.leaf} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
      <g className="im-bob" style={{ transformOrigin: '320px 220px' }}>
        <g transform="rotate(32 320 220)">
          <path className="im-flame" d="M296 330 Q320 470 344 330 Z" fill={`url(#${id}t)`} />
          <path className="im-flame" d="M306 330 Q320 410 334 330 Z" fill="#E9FFE9" opacity=".9" style={{ animationDelay: '.12s' }} />
          <path d="M272 262 L240 330 L292 318 Z" fill={`url(#${id}f)`} />
          <path d="M368 262 L400 330 L348 318 Z" fill={`url(#${id}f)`} />
          <path d="M320 70 C372 112 382 196 366 300 Q320 322 274 300 C258 196 268 112 320 70 Z" fill={`url(#${id}b)`} stroke="#B7C6BC" strokeWidth="1.5" />
          <path d="M320 70 C340 86 352 104 360 124 Q320 136 280 124 C288 104 300 86 320 70 Z" fill="#1A1F1C" />
          <circle cx="320" cy="190" r="34" fill="#1F7A33" />
          <circle cx="320" cy="190" r="26" fill="#0E1A12" />
          <circle cx="311" cy="181" r="7" fill="#FFFFFF" opacity=".55" />
          <path d="M276 300 Q320 322 364 300 L360 318 Q320 336 280 318 Z" fill={`url(#${id}f)`} />
          <path d="M320 300 V330" stroke={`url(#${id}f)`} strokeWidth="12" strokeLinecap="round" />
        </g>
      </g>
      <g fill={`url(#${id}c)`}>
        <circle className="im-puff" cx="200" cy="440" r="46" />
        <circle className="im-puff" cx="250" cy="420" r="58" style={{ animationDelay: '.6s' }} />
        <circle className="im-puff" cx="310" cy="448" r="50" style={{ animationDelay: '1.2s' }} />
        <circle className="im-puff" cx="160" cy="470" r="34" style={{ animationDelay: '1.8s' }} />
        <circle className="im-puff" cx="360" cy="470" r="36" style={{ animationDelay: '2.4s' }} />
        <ellipse cx="260" cy="482" rx="150" ry="26" />
      </g>
    </svg>
  )
}

// Service illustrations: soft "3D" objects built from gradients, one per kind.
export function ServiceArt({ kind }) {
  const id = useId().replace(/:/g, '')
  const g = (key, a, b) => <linearGradient id={`${id}${key}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
  const u = (key) => `url(#${id}${key})`
  const art = {
    seo: (
      <>
        <defs>{g('a', '#5CCB6E', '#1F7A33')}{g('b', '#E9F1EC', '#AFC2B5')}{g('c', '#FFFFFF', '#DCE8F7')}</defs>
        <rect x="30" y="58" width="12" height="26" rx="3" fill={u('a')} /><rect x="48" y="44" width="12" height="40" rx="3" fill={u('a')} /><rect x="66" y="30" width="12" height="54" rx="3" fill={u('a')} />
        <circle cx="56" cy="56" r="34" fill={u('c')} opacity=".55" stroke={u('b')} strokeWidth="8" />
        <rect x="80" y="82" width="34" height="14" rx="7" transform="rotate(45 80 82)" fill="#2F3A34" />
      </>
    ),
    ads: (
      <>
        <defs>{g('a', '#FF6B6B', '#E03131')}{g('b', '#FFFFFF', '#E7ECF8')}{g('c', '#4C6EF5', '#364FC7')}</defs>
        <rect x="8" y="22" width="78" height="58" rx="10" fill={u('b')} stroke="#D3DAEA" strokeWidth="2" /><rect x="8" y="22" width="78" height="14" rx="7" fill={u('c')} />
        <rect x="18" y="46" width="40" height="6" rx="3" fill="#C8D1E6" /><rect x="18" y="58" width="28" height="6" rx="3" fill="#C8D1E6" />
        <circle cx="86" cy="76" r="26" fill={u('a')} /><circle cx="86" cy="76" r="17" fill="#fff" /><circle cx="86" cy="76" r="9" fill={u('a')} />
        <path d="M86 76 L118 44" stroke="#2F3A34" strokeWidth="4" strokeLinecap="round" /><path d="M112 40 l10 -2 -2 10 z" fill="#2F3A34" />
      </>
    ),
    social: (
      <>
        <defs>{g('a', '#748FFC', '#4263EB')}{g('b', '#F783AC', '#D6336C')}{g('c', '#63E6BE', '#0CA678')}</defs>
        <rect x="10" y="30" width="56" height="46" rx="14" fill={u('a')} /><path d="M24 76 l-4 14 16-14z" fill={u('a')} />
        <path d="M28 52 h8 v14 h-8z M36 52 l6-12 c3 0 5 2 4 6 l-1 6 h7 c3 0 4 3 3 5 l-3 9 c-1 2-2 2-4 2 H36" fill="#fff" />
        <rect x="56" y="12" width="52" height="42" rx="14" fill={u('b')} /><path d="M98 54 l4 12 -14-12z" fill={u('b')} />
        <path d="M82 46 c-10-6-14-11-11-16 2-4 8-4 11 1 3-5 9-5 11-1 3 5-1 10-11 16z" fill="#fff" />
        <circle cx="96" cy="88" r="16" fill={u('c')} /><path d="M89 88 l5 5 9-10" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    email: (
      <>
        <defs>{g('a', '#FFD43B', '#F59F00')}{g('b', '#FFFFFF', '#F1F3F5')}{g('c', '#FFE066', '#FAB005')}</defs>
        <rect x="14" y="40" width="92" height="60" rx="8" fill={u('a')} />
        <rect x="26" y="16" width="68" height="62" rx="6" fill={u('b')} stroke="#E9ECEF" strokeWidth="2" />
        <circle cx="60" cy="46" r="15" fill="none" stroke={G.leaf} strokeWidth="4" /><circle cx="60" cy="46" r="5" fill={G.leaf} /><path d="M65 46 v4 a4 4 0 0 0 8 0 v-4" stroke={G.leaf} strokeWidth="4" fill="none" />
        <path d="M14 48 L60 80 L106 48 V100 H14 Z" fill={u('c')} />
      </>
    ),
  }
  return <svg aria-hidden="true" viewBox="0 0 124 104" style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}>{art[kind] ?? art.seo}</svg>
}

// Avatar drawn from initials: a gradient disc with a rotating dashed ring (no photos).
export function Avatar({ name, size = 96 }) {
  const id = useId().replace(/:/g, '')
  const initials = String(name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg aria-hidden="true" className="im-spin" viewBox="0 0 100 100" style={{ position: 'absolute', inset: -8, width: size + 16, height: size + 16 }}><circle cx="50" cy="50" r="47" fill="none" stroke={G.lime} strokeWidth="1.6" strokeDasharray="4 6" /></svg>
      <svg aria-hidden="true" viewBox="0 0 100 100" style={{ width: size, height: size, display: 'block' }}>
        <defs><linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E6F7E9" /><stop offset="1" stopColor="#9BDDA6" /></linearGradient></defs>
        <circle cx="50" cy="50" r="50" fill={`url(#${id}a)`} />
        <text x="50" y="50" dy=".35em" textAnchor="middle" fontFamily="inherit" fontWeight="800" fontSize="34" fill={G.forest}>{initials}</text>
      </svg>
    </div>
  )
}

// Hand-drawn looping arrow that draws itself when its section reveals.
export const CurlyArrow = ({ color = '#fff', style }) => (
  <svg aria-hidden="true" viewBox="0 0 120 70" width="110" style={{ display: 'block', overflow: 'visible', ...style }}>
    <path className="im-draw" style={{ '--len': 220 }} d="M112 8 C80 2 70 30 86 38 C100 45 104 22 84 22 C58 22 40 48 12 52" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path className="im-draw" style={{ '--len': 40, '--i': 4 }} d="M24 42 L12 52 L26 60" stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
