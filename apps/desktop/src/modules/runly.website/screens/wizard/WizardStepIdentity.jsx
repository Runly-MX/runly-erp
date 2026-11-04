// apps/desktop/src/modules/runly.website/screens/wizard/WizardStepIdentity.jsx
import { useState, useEffect, useMemo, useRef } from 'react'
import { Button, DistDropZone } from '@runly/ui'
import { CheckCircle2, ImagePlus, Loader2, Palette, Type } from 'lucide-react'
import { extractColorsFromFile, extractColorsFromBlobUrl, PRESET_COLORS } from '../../lib/colorExtract.js'
import { fontCss } from '../../lib/siteFonts.js'
import { formatBytes, optimizeLogo } from '../../lib/logoOptimize.js'
import { WizardFontPicker, useFontsReady } from './WizardFontPicker.jsx'

const FIVE_MB = 5 * 1024 * 1024

function LogoZone({ logoFile, logoPreviewUrl, companyLogoUrl, useCompanyLogo, onFile, onUseCompany, onRemove }) {
  const inputRef = useRef(null)

  const displayUrl = logoPreviewUrl ?? (useCompanyLogo ? companyLogoUrl : null)

  if (displayUrl) {
    return (
      <div className="flex items-start gap-4">
        <div className="w-20 h-20 rounded-xl border-2 border-border bg-card flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
          <img src={displayUrl} alt="Logo" className="max-w-full max-h-full object-contain p-1"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {logoFile ? logoFile.name : 'Logo de la empresa'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB` : 'Se usara como logo del sitio'}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button type="button" onClick={() => inputRef.current?.click()}
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer">
              Cambiar logo
            </button>
            <span className="text-muted-foreground">|</span>
            <button type="button" onClick={onRemove}
              className="text-xs font-semibold text-destructive hover:text-destructive/80 transition-colors cursor-pointer">
              Quitar
            </button>
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/*"
          onChange={(e) => { const f = e.target.files?.[0]; if (f && f.size <= FIVE_MB) onFile(f) }}
          className="sr-only"/>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {companyLogoUrl && (
        <button type="button" onClick={onUseCompany}
          className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all text-left cursor-pointer">
          <div className="w-10 h-10 rounded-lg border border-border bg-background flex items-center justify-center overflow-hidden shrink-0">
            <img src={companyLogoUrl} alt="Logo empresa" className="max-w-full max-h-full object-contain p-0.5"/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary">Usar logo de la empresa</p>
            <p className="text-xs text-muted-foreground">El mismo logo configurado en Empresa</p>
          </div>
        </button>
      )}
      <DistDropZone
        accept="image/*"
        maxSizeMB={5}
        fullScreenOverlay
        overlayLabel="Suelta tu logo aqui"
        overlayHint="PNG, SVG o WebP · Max 5 MB"
        onFile={onFile}
        emptyLabel="Subir logo propio"
        emptyHint="PNG, SVG o WebP · Max 5 MB"
      />
    </div>
  )
}

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-500/12 text-orange-600 dark:text-orange-400"><Icon className="h-4 w-4" aria-hidden /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">{label}</label>
      <div className="flex items-center gap-2.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 transition-colors focus-within:border-[hsl(var(--ring))]">
        <div className="relative">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          <div className="h-8 w-8 rounded-lg border border-[hsl(var(--border))] shadow-sm" style={{ background: value }} />
        </div>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} (código)`} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
      </div>
    </div>
  )
}

function Swatches({ colors, current, onPick }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button key={color} type="button" onClick={() => onPick(color)} aria-label={`Usar ${color}`} aria-pressed={current === color}
          className={`h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110 active:scale-95 ${current === color ? 'scale-110 border-[hsl(var(--foreground))] ring-2 ring-[hsl(var(--foreground))]/20' : 'border-[hsl(var(--border))]'}`}
          style={{ background: color }} />
      ))}
    </div>
  )
}

// A browser-window mock of the site so color and type choices read at a glance.
function LivePreview({ name, identity, logoUrl }) {
  const ready = useFontsReady(useMemo(() => [identity.headingFont, identity.bodyFont], [identity.headingFont, identity.bodyFont]))
  const heading = ready.has(identity.headingFont) ? { fontFamily: fontCss(identity.headingFont) } : undefined
  const body = ready.has(identity.bodyFont) ? { fontFamily: fontCss(identity.bodyFont) } : undefined
  return (
    <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] shadow-sm" aria-label="Vista previa del estilo">
      <div className="flex items-center gap-1.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[hsl(var(--border))]" /><span className="h-2 w-2 rounded-full bg-[hsl(var(--border))]" /><span className="h-2 w-2 rounded-full bg-[hsl(var(--border))]" />
        <span className="ml-2 truncate rounded-md bg-[hsl(var(--background))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">{(name || 'mi-sitio').toLowerCase().replace(/\s+/g, '-')}.sites</span>
      </div>
      <div className="space-y-3 p-5 transition-colors" style={{ background: identity.bgColor }}>
        <div className="flex items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="" style={{ height: Math.round(Number(identity.logoHeight || 40) * 0.6) }} className="max-w-32 object-contain" /> : <span className="h-5 w-5 rounded-md" style={{ background: identity.primaryColor }} />}
          <span className="text-xs font-semibold" style={{ ...heading, color: identity.primaryColor }}>{name || 'Mi sitio'}</span>
        </div>
        <h4 className="text-2xl font-bold leading-tight" style={{ ...heading, color: identity.primaryColor }}>{name || 'Tu negocio, en línea'}</h4>
        <p className="max-w-sm text-sm opacity-80" style={{ ...body, color: '#334155' }}>Así se verán tus textos. Cambia colores y fuentes y mira el resultado al instante.</p>
        <span className="inline-block rounded-lg px-4 py-2 text-xs font-semibold text-white" style={{ ...body, background: identity.primaryColor }}>Contáctanos</span>
      </div>
    </div>
  )
}

export function WizardStepIdentity({ defaultValues, companyLogoUrl, siteName = '', onNext, onBack }) {
  const [identity, setIdentity] = useState(() => ({ primaryColor: '#4F46E5', bgColor: '#FFFFFF', font: 'Inter', headingFont: 'Inter', bodyFont: 'Inter', logoHeight: '40', ...(defaultValues ?? {}) }))
  const [logoFile,        setLogoFile]        = useState(null)
  const [logoPreviewUrl,  setLogoPreviewUrl]  = useState(null)
  const [useCompanyLogo,  setUseCompanyLogo]  = useState(false)
  const [suggestedColors, setSuggestedColors] = useState(PRESET_COLORS)
  const [logoInfo, setLogoInfo] = useState(null)
  const [optimizing, setOptimizing] = useState(false)
  const [logoError, setLogoError] = useState('')
  const set = (patch) => setIdentity((i) => ({ ...i, ...patch }))

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null)
      if (!useCompanyLogo) setSuggestedColors(PRESET_COLORS)
      return
    }
    const url = URL.createObjectURL(logoFile)
    setLogoPreviewUrl(url)
    extractColorsFromFile(logoFile).then((colors) => {
      setSuggestedColors(colors.length >= 3 ? colors : PRESET_COLORS)
    })
    return () => URL.revokeObjectURL(url)
  }, [logoFile, useCompanyLogo])

  useEffect(() => {
    if (!useCompanyLogo || !companyLogoUrl) return
    extractColorsFromBlobUrl(companyLogoUrl).then((colors) => {
      if (colors.length >= 3) setSuggestedColors(colors)
    })
  }, [useCompanyLogo, companyLogoUrl])

  async function pickLogo(file) {
    setUseCompanyLogo(false); setLogoError(''); setOptimizing(true)
    try {
      const result = await optimizeLogo(file)
      setLogoFile(result.file); setLogoInfo(result)
    } catch {
      setLogoFile(null); setLogoInfo(null); setLogoError('No pudimos leer ese archivo. Prueba con un PNG, WebP o SVG.')
    } finally { setOptimizing(false) }
  }

  function clearLogo() {
    setLogoFile(null); setLogoPreviewUrl(null); setUseCompanyLogo(false); setLogoInfo(null); setLogoError(''); setSuggestedColors(PRESET_COLORS)
  }

  async function handleSubmit() {
    let finalLogo = logoFile
    if (!finalLogo && useCompanyLogo && companyLogoUrl) {
      setOptimizing(true)
      try {
        const blob = await (await fetch(companyLogoUrl)).blob()
        finalLogo = (await optimizeLogo(new File([blob], 'logo-empresa', { type: blob.type || 'image/png' }))).file
      } catch { finalLogo = null } finally { setOptimizing(false) }
    }
    // font stays the body family so older consumers keep working.
    onNext({ ...identity, font: identity.bodyFont, logoFile: finalLogo, useCompanyLogo })
  }

  const fromLogo = suggestedColors !== PRESET_COLORS && suggestedColors.length > 0

  return (
    <div className="space-y-4">
      <LivePreview name={siteName} identity={identity} logoUrl={logoPreviewUrl ?? (useCompanyLogo ? companyLogoUrl : null)} />

      <Section icon={ImagePlus} title="Logo" hint="Opcional. Lo recortamos y optimizamos para que cargue rápido, y sale en el encabezado de tus páginas.">
        <LogoZone
          logoFile={logoFile}
          logoPreviewUrl={logoPreviewUrl}
          companyLogoUrl={companyLogoUrl}
          useCompanyLogo={useCompanyLogo}
          onFile={pickLogo}
          onUseCompany={() => { setLogoFile(null); setLogoPreviewUrl(null); setUseCompanyLogo(true) }}
          onRemove={clearLogo}
        />
        {optimizing && <p role="status" className="mt-3 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Optimizando tu logo…</p>}
        {logoError && <p role="alert" className="mt-3 text-xs text-[hsl(var(--destructive))]">{logoError}</p>}
        {logoInfo && !optimizing && (
          <div className="mt-3 space-y-3">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-emerald-500/8 p-3 text-xs text-[hsl(var(--foreground))]">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <span className="font-medium">Listo para cargar rápido:</span>
              <span>{formatBytes(logoInfo.before)} → {formatBytes(logoInfo.after)} · {logoInfo.width}×{logoInfo.height}px · {logoInfo.format.toUpperCase()}</span>
              {logoInfo.trimmed && <span>· márgenes vacíos recortados</span>}
              {logoInfo.vector && <span>· SVG convertido a imagen</span>}
            </p>
            <div className="grid grid-cols-2 gap-2" aria-label="Cómo se ve sobre fondo claro y oscuro">
              <span className="grid h-16 place-items-center rounded-xl border border-[hsl(var(--border))] bg-white"><img src={logoPreviewUrl} alt="" className="max-h-10 max-w-[80%] object-contain" /></span>
              <span className="grid h-16 place-items-center rounded-xl border border-[hsl(var(--border))] bg-slate-900"><img src={logoPreviewUrl} alt="" className="max-h-10 max-w-[80%] object-contain" /></span>
            </div>
          </div>
        )}
        {(logoFile || useCompanyLogo) && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-[hsl(var(--muted-foreground))]">Tamaño en el encabezado del sitio</p>
            <div role="radiogroup" aria-label="Tamaño del logo" className="inline-flex rounded-lg bg-[hsl(var(--muted))] p-0.5">
              {[['24', 'Chico'], ['32', 'Mediano'], ['40', 'Normal'], ['48', 'Grande'], ['64', 'Extra']].map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={identity.logoHeight === value} onClick={() => set({ logoHeight: value })}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${identity.logoHeight === value ? 'bg-[hsl(var(--card))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section icon={Palette} title="Colores" hint="Un color de marca y el fondo de tus páginas.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Color primario" value={identity.primaryColor} onChange={(primaryColor) => set({ primaryColor })} />
          <ColorField label="Color de fondo" value={identity.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </div>
        {fromLogo && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">Extraídos del logo</p>
            <Swatches colors={suggestedColors} current={identity.primaryColor} onPick={(primaryColor) => set({ primaryColor })} />
          </div>
        )}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">Predefinidos</p>
          <Swatches colors={PRESET_COLORS} current={identity.primaryColor} onPick={(primaryColor) => set({ primaryColor })} />
        </div>
      </Section>

      <Section icon={Type} title="Tipografía" hint="Elige una combinación o ajusta títulos y texto por separado.">
        <WizardFontPicker headingFont={identity.headingFont} bodyFont={identity.bodyFont} onChange={set} />
      </Section>

      <div className="flex gap-3 pt-1">
        {onBack && <Button variant="outline" className="flex-1" onClick={onBack}>Atrás</Button>}
        <Button className="flex-1" onClick={handleSubmit} disabled={optimizing}>{optimizing ? 'Preparando logo…' : 'Siguiente'}</Button>
      </div>
    </div>
  )
}
