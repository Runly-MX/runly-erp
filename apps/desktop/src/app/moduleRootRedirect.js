// Where the module root (`/app/m/<key>/`) redirects: the first navigation item. The query
// string and hash travel with the redirect, otherwise a deep link such as
// `/app/m/runly.notes/?note=<id>` loses its target and the note never opens.
export function moduleRootRedirect(module, subPath, { search = '', hash = '' } = {}) {
  if (subPath !== '/') return null
  const navigation = module?.navigation ?? []
  if (!navigation.length) return null
  if (navigation.some((item) => item?.path === '/')) return null
  const fallbackPath = navigation[0]?.path
  if (!fallbackPath || fallbackPath === '/') return null
  const targetPath = fallbackPath.startsWith('/app/m/') ? fallbackPath : `/app/m/${module.key}${fallbackPath}`
  const target = new URL(targetPath, 'http://runly.invalid')
  for (const [key, value] of new URLSearchParams(search)) target.searchParams.set(key, value)
  if (hash) target.hash = hash
  return `${target.pathname}${target.search}${target.hash}`
}
