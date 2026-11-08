import { ICON_NOTICES } from './icon-notices.js'
export const STUDIO_PROVIDERS=Object.freeze([
  {id:'iconify',type:'vector',operations:['search','details','thumbnail','import','attribution'],persistence:'document-geometry'},
  {id:'openverse',type:'image',operations:['search','details','thumbnail','import','attribution'],persistence:'files-original'},
])
const versions = new Set(['1.0','2.0','2.5','3.0','4.0'])
export function openverseLicense(row) {
  const code=typeof row?.license==='string'?row.license.toLowerCase():'',version=typeof row?.license_version==='string'?row.license_version:''
  let license=null
  if (code==='cc0' && version==='1.0') license={id:'CC0-1.0',url:'https://creativecommons.org/publicdomain/zero/1.0/',attributionRequired:false}
  if (code==='pdm' && version==='1.0') license={id:'PDM-1.0',url:'https://creativecommons.org/publicdomain/mark/1.0/',attributionRequired:false}
  if (code==='by' && versions.has(version)) license={id:`CC-BY-${version}`,url:`https://creativecommons.org/licenses/by/${version}/`,attributionRequired:true}
  if(license&&row.license_url!==undefined){
    try{
      const actual=new URL(row.license_url),canonical=new URL(license.url)
      if(!['http:','https:'].includes(actual.protocol)||actual.hostname!==canonical.hostname||actual.username||actual.password||actual.port||
        (actual.pathname!==canonical.pathname&&!actual.pathname.startsWith(`${canonical.pathname}deed.`)))return null
    }catch{return null}
  }
  return license
}
export const ICON_COLLECTIONS=Object.freeze([
  {id:'tabler',name:'Tabler Icons',author:'Paweł Kuna / Tabler',license:'MIT',licenseUrl:'https://github.com/tabler/tabler-icons/blob/main/LICENSE',sourceUrl:'https://tabler.io/icons'},
  {id:'lucide',name:'Lucide',author:'Lucide Contributors / Cole Bemis',license:'ISC / MIT',licenseUrl:'https://github.com/lucide-icons/lucide/blob/main/LICENSE',sourceUrl:'https://lucide.dev/icons/'},
])
export const LOCAL_ICON_COLLECTION=Object.freeze({id:'local',name:'Básicos sin conexión',license:'ISC / MIT'})
export function iconSource(id) {
  if(typeof id!=='string'||! /^(tabler|lucide):[a-z0-9][a-z0-9-]{0,79}$/.test(id)) return null
  const collection=ICON_COLLECTIONS.find(row=>row.id===id.split(':')[0])
  return {provider:'iconify',id,type:'vector',title:id.split(':')[1],author:collection.author,license:collection.license,licenseUrl:collection.licenseUrl,sourceUrl:collection.sourceUrl,attributionRequired:true,available:true}
}
export function creditsText(resources) {
  const rows=[...new Map(resources.filter(Boolean).map(row=>[`${row.provider}:${row.id}`,row])).values()]
  const credits=rows.map(row=>row.provider==='local-svg'?`${row.title} — SVG local. Licencia no declarada; verifica los derechos antes de publicar.`:`${row.title} — ${row.author || 'Autor no indicado'}. ${row.license} (${row.licenseUrl}). ${row.sourceUrl}. Incluido en una composición; puede tener cambios de tamaño, color o recorte.`)
  const collections=new Set(rows.filter(row=>row.provider==='iconify').map(row=>row.id.split(':')[0]))
  return [...credits,...[...collections].map(id=>ICON_NOTICES[id]).filter(Boolean)].join('\n\n')
}
