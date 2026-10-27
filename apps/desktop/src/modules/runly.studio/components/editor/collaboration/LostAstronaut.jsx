// Illustration for the "no access" screen: an astronaut sitting on a drifting rock
// with a cut tether, lost among stars. Pure SVG + CSS keyframes (no deps); every
// animation stops under prefers-reduced-motion. Decorative: hidden from assistive tech.
const STARS = [[30, 30, 1.6], [78, 62, 1.1], [120, 24, 1.4], [168, 48, 1], [252, 22, 1.5], [300, 44, 1.1], [362, 26, 1.6], [388, 96, 1.2], [20, 118, 1.2],
  [46, 168, 1], [350, 150, 1.4], [384, 200, 1], [280, 270, 1.3], [226, 284, 1], [140, 276, 1.2], [96, 214, 1], [330, 232, 1.1], [204, 20, 1], [64, 96, 1.5], [316, 106, 1]]

const CSS = `
.lost-anim{transform-box:fill-box}
@keyframes lost-bob{from{transform:translateY(0)}to{transform:translateY(-9px)}}
@keyframes lost-head{from{transform:rotate(-3deg)}to{transform:rotate(4deg)}}
@keyframes lost-wave{from{transform:rotate(0)}to{transform:rotate(-9deg)}}
@keyframes lost-sway{from{transform:rotate(-2deg)}to{transform:rotate(3deg)}}
@keyframes lost-twinkle{from{opacity:.2}to{opacity:1}}
@keyframes lost-q{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-34px);opacity:0}}
@keyframes lost-blink{0%,49%{opacity:1}50%,100%{opacity:.15}}
@keyframes lost-eye{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
@keyframes lost-sat{from{transform:translate(-26px,4px) rotate(-8deg)}to{transform:translate(26px,-4px) rotate(8deg)}}
@keyframes lost-shoot{0%,78%{transform:translate(0,0);opacity:0}80%{opacity:1}100%{transform:translate(-130px,70px);opacity:0}}
@media (prefers-reduced-motion:reduce){.lost-anim{animation:none!important}}
`

const anim = (name, seconds, extra = '') => ({ animation: `${name} ${seconds}s ease-in-out infinite ${extra}` })

export function LostAstronaut({ className }) {
  return (
    <svg viewBox="0 0 400 300" className={className} aria-hidden focusable="false">
      <style>{CSS}</style>
      <defs>
        <linearGradient id="lost-visor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b2a8f" /><stop offset="1" stopColor="#c026d3" /></linearGradient>
        <linearGradient id="lost-planet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f0abfc" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
        <linearGradient id="lost-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b7bb8" /><stop offset="1" stopColor="#4a3f73" /></linearGradient>
        <radialGradient id="lost-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#a855f7" stopOpacity=".35" /><stop offset="1" stopColor="#a855f7" stopOpacity="0" /></radialGradient>
      </defs>

      {STARS.map(([x, y, r], index) => <circle key={index} className="lost-anim" cx={x} cy={y} r={r} fill="#fff" style={anim('lost-twinkle', 2.4 + (index % 5) * 0.6, `alternate ${-index * 0.4}s`)} />)}
      <line className="lost-anim" x1="330" y1="40" x2="352" y2="30" stroke="#fff" strokeWidth="2" strokeLinecap="round" style={{ animation: 'lost-shoot 9s linear infinite' }} />

      <circle cx="205" cy="150" r="130" fill="url(#lost-glow)" />

      {/* Far planet with a ring, and a small moon */}
      <g>
        <ellipse cx="62" cy="262" rx="118" ry="26" fill="none" stroke="#fbcfe8" strokeOpacity=".55" strokeWidth="5" transform="rotate(-18 62 262)" />
        <circle cx="62" cy="262" r="72" fill="url(#lost-planet)" />
        <path d="M20 232c26-18 70-14 96 8" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="6" strokeLinecap="round" />
        <ellipse cx="62" cy="262" rx="118" ry="26" fill="none" stroke="#fbcfe8" strokeOpacity=".7" strokeWidth="5" strokeDasharray="130 400" strokeDashoffset="-170" transform="rotate(-18 62 262)" />
      </g>
      <circle cx="346" cy="66" r="20" fill="#e9d5ff" /><circle cx="338" cy="60" r="4" fill="#c4b5fd" /><circle cx="354" cy="74" r="3" fill="#c4b5fd" />

      {/* Drifting satellite */}
      <g className="lost-anim" style={anim('lost-sat', 16, 'alternate')}>
        <rect x="288" y="112" width="16" height="11" rx="2" fill="#cbd5e1" />
        <rect x="268" y="114" width="18" height="7" rx="1" fill="#38bdf8" /><rect x="306" y="114" width="18" height="7" rx="1" fill="#38bdf8" />
        <line x1="296" y1="112" x2="296" y2="104" stroke="#cbd5e1" strokeWidth="1.5" /><circle cx="296" cy="103" r="2" fill="#f472b6" />
      </g>

      {/* Question marks drifting up */}
      {[[252, 84, 0], [150, 70, 1.7], [226, 56, 3.2]].map(([x, y, delay]) => (
        <text key={x} className="lost-anim" x={x} y={y} fontSize="24" fontWeight="700" fill="#f0abfc" style={{ animation: `lost-q 5s ease-out infinite ${delay}s`, opacity: 0 }}>?</text>
      ))}

      {/* Rock + astronaut float together */}
      <g className="lost-anim" style={anim('lost-bob', 6, 'alternate')}>
        <path d="M104 218c8-28 62-40 112-37 46 3 86 13 78 40-4 18-44 34-92 34-48 0-92-8-98-37z" fill="url(#lost-rock)" />
        <path d="M104 218c8-28 62-40 112-37 46 3 86 13 78 40" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="150" cy="226" rx="16" ry="6" fill="#3b3160" opacity=".7" /><ellipse cx="246" cy="232" rx="11" ry="4" fill="#3b3160" opacity=".7" /><ellipse cx="204" cy="244" rx="8" ry="3" fill="#3b3160" opacity=".6" />

        {/* Cut tether, swaying from the backpack */}
        <g className="lost-anim" style={{ ...anim('lost-sway', 3.4, 'alternate'), transformOrigin: '170px 150px', transformBox: 'view-box' }}>
          <path d="M168 152C124 150 104 196 74 178C52 165 42 140 28 130" fill="none" stroke="#f6c453" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M28 130l-9-5M28 130l-5-9M28 130l-10 1" stroke="#f6c453" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Backpack and its blinking SOS light */}
        <rect x="160" y="112" width="30" height="66" rx="10" fill="#b9c2d9" />
        <rect x="164" y="120" width="8" height="20" rx="3" fill="#94a3b8" />
        <circle className="lost-anim" cx="175" cy="108" r="4.5" fill="#ff4d6d" style={{ animation: 'lost-blink 1s steps(1) infinite' }} />

        {/* Legs dangling over the edge, boots in the accent color */}
        <rect x="182" y="168" width="22" height="40" rx="11" fill="#f4f6fb" stroke="#cfd6e6" strokeWidth="2" />
        <rect x="208" y="170" width="22" height="38" rx="11" fill="#f4f6fb" stroke="#cfd6e6" strokeWidth="2" />
        <rect x="178" y="200" width="30" height="16" rx="8" fill="#e0457b" /><rect x="206" y="202" width="30" height="16" rx="8" fill="#e0457b" />

        {/* Torso and chest panel */}
        <rect x="176" y="108" width="54" height="68" rx="21" fill="#f4f6fb" stroke="#cfd6e6" strokeWidth="2" />
        <rect x="190" y="128" width="26" height="17" rx="4" fill="#dfe4f1" />
        <circle cx="196" cy="136" r="2.4" fill="#ef4444" /><circle cx="203" cy="136" r="2.4" fill="#22c55e" /><circle cx="210" cy="136" r="2.4" fill="#facc15" />

        {/* Resting arm */}
        <path d="M226 124Q244 142 230 164" fill="none" stroke="#cfd6e6" strokeWidth="21" strokeLinecap="round" />
        <path d="M226 124Q244 142 230 164" fill="none" stroke="#f4f6fb" strokeWidth="17" strokeLinecap="round" />
        <circle cx="230" cy="166" r="9" fill="#e0457b" />

        {/* Raised arm scratching the helmet */}
        <g className="lost-anim" style={{ ...anim('lost-wave', 2.2, 'alternate'), transformOrigin: '182px 122px', transformBox: 'view-box' }}>
          <path d="M182 122Q142 138 143 104Q143 92 150 86" fill="none" stroke="#cfd6e6" strokeWidth="21" strokeLinecap="round" />
          <path d="M182 122Q142 138 143 104Q143 92 150 86" fill="none" stroke="#f4f6fb" strokeWidth="17" strokeLinecap="round" />
          <circle cx="150" cy="82" r="9" fill="#e0457b" />
        </g>

        {/* Helmet: tilts slowly, eyes blink */}
        <g className="lost-anim" style={{ ...anim('lost-head', 5, 'alternate'), transformOrigin: '200px 118px', transformBox: 'view-box' }}>
          <line x1="228" y1="58" x2="234" y2="38" stroke="#cfd6e6" strokeWidth="3" strokeLinecap="round" /><circle cx="234" cy="36" r="4" fill="#f472b6" />
          <circle cx="200" cy="84" r="41" fill="#f4f6fb" stroke="#cfd6e6" strokeWidth="3" />
          <ellipse cx="204" cy="86" rx="30" ry="25" fill="url(#lost-visor)" />
          <path d="M184 74c6-9 20-12 32-8" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" />
          <g className="lost-anim" style={anim('lost-eye', 5)}>
            <ellipse cx="194" cy="90" rx="5.5" ry="7" fill="#fff" /><ellipse cx="214" cy="90" rx="5.5" ry="7" fill="#fff" />
            <circle cx="196" cy="88" r="2.6" fill="#1e1b4b" /><circle cx="216" cy="88" r="2.6" fill="#1e1b4b" />
          </g>
          <path d="M188 80l10-3M220 77l10 3" stroke="#fff" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  )
}
