// apps/desktop/src/modules/runly.website/screens/wizard/WizardStepIdentity.jsx
import { useState, useEffect, useRef } from 'react'
import { DistDropZone } from '@runly/ui'
import { extractColorsFromFile, extractColorsFromBlobUrl, PRESET_COLORS } from '../../lib/colorExtract.js'

const FONTS = [
  { value: 'Inter',            label: 'Inter',            family: 'Inter, sans-serif' },
  { value: 'Playfair Display', label: 'Playfair Display', family: "'Playfair Display', serif" },
  { value: 'Space Grotesk',    label: 'Space Grotesk',    family: "'Space Grotesk', sans-serif" },
  { value: 'DM Sans',          label: 'DM Sans',          family: "'DM Sans', sans-serif" },
  { value: 'Merriweather',     label: 'Merriweather',     family: "'Merriweather', serif" },
]

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

export function WizardStepIdentity({ defaultValues, companyLogoUrl, onNext, onBack }) {
  const [identity, setIdentity] = useState(defaultValues ?? {
    primaryColor: '#4F46E5',
    bgColor: '#FFFFFF',
    font: 'Inter',
  })
  const [logoFile,        setLogoFile]        = useState(null)
  const [logoPreviewUrl,  setLogoPreviewUrl]  = useState(null)
  const [useCompanyLogo,  setUseCompanyLogo]  = useState(false)
  const [suggestedColors, setSuggestedColors] = useState(PRESET_COLORS)

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

  function handleSubmit() {
    onNext({ ...identity, logoFile, useCompanyLogo })
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">Logo del sitio</label>
        <LogoZone
          logoFile={logoFile}
          logoPreviewUrl={logoPreviewUrl}
          companyLogoUrl={companyLogoUrl}
          useCompanyLogo={useCompanyLogo}
          onFile={(f) => { setUseCompanyLogo(false); setLogoFile(f) }}
          onUseCompany={() => { setLogoFile(null); setLogoPreviewUrl(null); setUseCompanyLogo(true) }}
          onRemove={() => { setLogoFile(null); setLogoPreviewUrl(null); setUseCompanyLogo(false); setSuggestedColors(PRESET_COLORS) }}
        />
      </div>

      <hr className="border-border"/>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">Color primario</label>
          <div className="flex items-center gap-2.5 border-2 border-border rounded-xl px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all bg-background">
            <div className="relative">
              <input type="color" value={identity.primaryColor}
                onChange={(e) => setIdentity((i) => ({ ...i, primaryColor: e.target.value }))}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
              <div className="w-8 h-8 rounded-lg shadow-sm border border-border/50" style={{ background: identity.primaryColor }}/>
            </div>
            <input type="text" value={identity.primaryColor}
              onChange={(e) => setIdentity((i) => ({ ...i, primaryColor: e.target.value }))}
              className="flex-1 text-sm font-mono text-foreground outline-none bg-transparent"/>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5">Color de fondo</label>
          <div className="flex items-center gap-2.5 border-2 border-border rounded-xl px-3 py-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all bg-background">
            <div className="relative">
              <input type="color" value={identity.bgColor}
                onChange={(e) => setIdentity((i) => ({ ...i, bgColor: e.target.value }))}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
              <div className="w-8 h-8 rounded-lg shadow-sm border border-border" style={{ background: identity.bgColor }}/>
            </div>
            <input type="text" value={identity.bgColor}
              onChange={(e) => setIdentity((i) => ({ ...i, bgColor: e.target.value }))}
              className="flex-1 text-sm font-mono text-foreground outline-none bg-transparent"/>
          </div>
        </div>
      </div>

      {suggestedColors !== PRESET_COLORS && suggestedColors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Colores extraídos del logo</p>
          <div className="flex gap-2 flex-wrap">
            {suggestedColors.map((color) => (
              <button key={color} type="button" onClick={() => setIdentity((i) => ({ ...i, primaryColor: color }))}
                aria-label={`Usar ${color}`}
                className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 active:scale-95 ${
                  identity.primaryColor === color ? 'border-foreground scale-110 ring-2 ring-foreground/20' : 'border-border hover:border-foreground/40'
                }`}
                style={{ background: color }}/>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Colores predefinidos</p>
        <div className="flex gap-2 flex-wrap">
          {PRESET_COLORS.map((color) => (
            <button key={color} type="button" onClick={() => setIdentity((i) => ({ ...i, primaryColor: color }))}
              aria-label={`Usar ${color}`}
              className={`w-8 h-8 rounded-lg border-2 transition-all hover:scale-110 active:scale-95 ${
                identity.primaryColor === color ? 'border-foreground scale-110 ring-2 ring-foreground/20' : 'border-border hover:border-foreground/40'
              }`}
              style={{ background: color }}/>
          ))}
        </div>
      </div>

      <div className="h-8 rounded-xl border border-border transition-all duration-300"
        style={{ background: `linear-gradient(90deg, ${identity.primaryColor} 0%, ${identity.primaryColor}bb 40%, ${identity.bgColor} 100%)` }}/>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">Tipografía</label>
        <div className="grid grid-cols-5 gap-2">
          {FONTS.map((f) => (
            <button key={f.value} type="button"
              onClick={() => setIdentity((i) => ({ ...i, font: f.value }))}
              className={`rounded-xl border-2 p-3 text-center transition-all duration-150 ${
                identity.font === f.value
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'border-border hover:border-border/80 bg-card'
              }`}>
              <p className="text-lg font-semibold text-foreground leading-none" style={{ fontFamily: f.family }}>Aa</p>
              <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight truncate">{f.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        {onBack && (
          <button type="button" onClick={onBack}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-foreground border-2 border-border hover:bg-muted transition-all">
            Atrás
          </button>
        )}
        <button type="button" onClick={handleSubmit}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all">
          Siguiente
        </button>
      </div>
    </div>
  )
}
