// Presentation only. Installed state, filtered navigation and authorization stay server-owned.
export const STUDIO_BRANDING = Object.freeze({
  name: 'Studio',
  description: 'Diseño gráfico y edición multimedia',
  icon: 'PenTool',
  color: '#D946EF',
})

function navigationBranding(navigation) {
  if (!Array.isArray(navigation)) return navigation
  return navigation.map(item => ['/', '/app/m/runly.studio', '/app/m/runly.studio/'].includes(item?.path)
    ? { ...item, icon: STUDIO_BRANDING.icon } : item)
}

// Existing installations and cached API responses may still contain the former
// official name/icon/color. Project current display metadata without syncing DB rows.
export function applyStudioBranding(module) {
  if (module?.key !== 'runly.studio') return module
  return { ...module, ...STUDIO_BRANDING, summary: STUDIO_BRANDING.description,
    navigation: navigationBranding(module.navigation),
    manifest: module.manifest ? { ...module.manifest, ...STUDIO_BRANDING, summary: STUDIO_BRANDING.description,
      navigation: navigationBranding(module.manifest.navigation),
      ...(module.manifest.pwa ? { pwa: { ...module.manifest.pwa, shortName: STUDIO_BRANDING.name } } : {}),
    } : module.manifest,
  }
}
