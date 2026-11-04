// Shared look of the store blocks (theme tokens with safe fallbacks).
export const SERIF = "var(--runly-font-serif, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif)"
export const SANS = 'var(--runly-font-sans, Inter, system-ui, sans-serif)'
export const INK = 'var(--runly-color-fg, #1F1A17)'
export const MUTED = 'var(--runly-color-muted, #6B5F55)'
export const ACCENT = 'var(--runly-color-accent, #B4411F)'
export const PAPER = 'var(--runly-color-bg, #FAF7F2)'
export const LINE = 'rgba(31,26,23,.14)'

export const button = (primary = true) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '44px', padding: '0 24px', borderRadius: '999px',
  border: `1.5px solid ${INK}`, background: primary ? INK : 'transparent', color: primary ? PAPER : INK,
  fontFamily: SANS, fontSize: '14px', fontWeight: 700, letterSpacing: '.02em', textDecoration: 'none', cursor: 'pointer',
})
export const FOCUS_CSS = `.rs-btn{transition:transform .18s ease,background .18s ease,color .18s ease}.rs-btn:hover{transform:translateY(-1px)}.rs-btn:focus-visible,.rs-field:focus-visible,.rs-chip:focus-visible,.rs-card a:focus-visible{outline:3px solid ${ACCENT};outline-offset:2px}@media (prefers-reduced-motion:reduce){.rs-btn,.rs-card,.rs-card *{transition:none!important;transform:none!important}}`
export const Styles = () => <style>{FOCUS_CSS}</style>
