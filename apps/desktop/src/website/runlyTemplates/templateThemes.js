// One theme per built-in template: palette, type, corner radius and button style chosen together so every page of a
// template shares the same look. Only groups the theme service accepts are set (color, font, radius, button, card).
const sans = "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"
const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

export const TEMPLATE_THEMES = {
  'atlas-restaurante': {
    color: { primary: '#9A3412', primaryFg: '#FFFFFF', bg: '#FFFBF5', fg: '#1C1917', muted: '#78716C', accent: '#D97706' },
    font: { sans: serif },
    radius: { md: '6px', lg: '10px' },
    button: { style: 'solid', radius: 'sm' },
    card: { radius: 'md', shadow: 'sm', padding: '6' },
  },
  'atlas-spa': {
    color: { primary: '#0F766E', primaryFg: '#FFFFFF', bg: '#F7FAF8', fg: '#16302B', muted: '#5F7A74', accent: '#C08457' },
    font: { sans },
    radius: { md: '12px', lg: '24px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'sm', padding: '8' },
  },
  'atlas-tienda': {
    color: { primary: '#18181B', primaryFg: '#FFFFFF', bg: '#FFFFFF', fg: '#18181B', muted: '#71717A', accent: '#E11D48' },
    font: { sans },
    radius: { md: '10px', lg: '16px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'sm', padding: '6' },
  },
  'atlas-agencia': {
    color: { primary: '#6D28D9', primaryFg: '#FFFFFF', bg: '#FAFAFB', fg: '#0F0A1F', muted: '#6B6880', accent: '#F59E0B' },
    font: { sans },
    radius: { md: '8px', lg: '14px' },
    button: { style: 'solid', radius: 'md' },
    card: { radius: 'lg', shadow: 'md', padding: '6' },
  },
  'atlas-negocio': {
    color: { primary: '#1E40AF', primaryFg: '#FFFFFF', bg: '#FFFFFF', fg: '#0F172A', muted: '#64748B', accent: '#0EA5E9' },
    font: { sans },
    radius: { md: '8px', lg: '12px' },
    button: { style: 'solid', radius: 'md' },
    card: { radius: 'lg', shadow: 'md', padding: '6' },
  },
  'atlas-habitia': {
    color: { primary: '#B5603A', primaryFg: '#FFFFFF', bg: '#FAF7F2', fg: '#1A1410', muted: '#8C7E72', accent: '#4D6B4A' },
    font: { sans: serif },
    radius: { md: '4px', lg: '8px' },
    button: { style: 'solid', radius: 'sm' },
    card: { radius: 'md', shadow: 'sm', padding: '6' },
  },
  'atlas-finora': {
    color: { primary: '#17835E', primaryFg: '#FFFFFF', bg: '#F6FBF8', fg: '#0B2E22', muted: '#5C7A6D', accent: '#0B3D2E' },
    font: { sans },
    radius: { md: '12px', lg: '20px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'sm', padding: '6' },
  },
  'atlas-maya': {
    color: { primary: '#2563EB', primaryFg: '#FFFFFF', bg: '#F5F9FF', fg: '#0F2347', muted: '#5B6B88', accent: '#FBBF24' },
    font: { sans },
    radius: { md: '12px', lg: '20px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'md', padding: '6' },
  },
  'atlas-aurora': {
    color: { primary: '#0E7490', primaryFg: '#FFFFFF', bg: '#FBF7F0', fg: '#0B1B2B', muted: '#52606D', accent: '#F97316' },
    font: { sans },
    radius: { md: '12px', lg: '22px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'md', padding: '6' },
  },
}
