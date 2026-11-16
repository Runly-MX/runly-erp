export const WEBSITE_FONT_STYLES_ORIGIN='https://fonts.googleapis.com'
export const WEBSITE_FONT_FILES_ORIGIN='https://fonts.gstatic.com'

// Browser loads only: this never fetches a tenant URL from the API server.
export function isWebsiteFontReference(ref,kind) {
  let url
  try{url=new URL(ref)}catch{return false}
  if(url.protocol!=='https:'||url.username||url.password||url.hash)return false
  if(kind==='stylesheet')return url.origin===WEBSITE_FONT_STYLES_ORIGIN&&/^\/css2?$/.test(url.pathname)
  if(kind==='font')return url.origin===WEBSITE_FONT_FILES_ORIGIN&&/^\/s\/.+\.(?:woff2?|ttf|otf)$/.test(url.pathname)
  return kind==='preconnect'&&[WEBSITE_FONT_STYLES_ORIGIN,WEBSITE_FONT_FILES_ORIGIN].includes(url.origin)&&url.pathname==='/'&&!url.search
}

export function isWebsiteFontLink(node) {
  if(node?.tagName!=='link')return false
  const attrs=Object.fromEntries((node.attrs??[]).map(a=>[a.name,a.value]))
  const rel=(attrs.rel??'').trim().toLowerCase(),as=(attrs.as??'').trim().toLowerCase()
  const kind=rel==='stylesheet'?'stylesheet':rel==='preconnect'?'preconnect':rel==='preload'?(as==='font'?'font':as==='style'?'stylesheet':null):null
  return !!kind&&isWebsiteFontReference(attrs.href,kind)
}
