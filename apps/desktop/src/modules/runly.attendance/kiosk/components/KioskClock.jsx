import { useEffect, useState } from 'react'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function KioskClock({ siteName, companyName }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const hm = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const date = capitalize(now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  return (
    <div className="flex flex-col items-center justify-center text-center">
      {companyName && <p className="text-sm font-medium uppercase tracking-[0.3em] text-teal-300/80">{companyName}</p>}
      {siteName && <p className="mt-1 text-lg text-slate-300">{siteName}</p>}
      <p
        className="mt-3 font-light leading-none tabular-nums text-white drop-shadow-[0_0_40px_rgba(13,148,136,0.35)] text-[clamp(4rem,17vmin,11rem)]"
        aria-label={`Hora ${hm}`}
      >
        {hm}
        <span className="ml-2 align-top text-[0.28em] text-teal-400/90">{seconds}</span>
      </p>
      <p className="mt-3 text-[clamp(1rem,2.6vmin,1.6rem)] text-slate-300">{date}</p>
    </div>
  )
}
