import { readFileSync } from 'node:fs'
import { iconSource } from '../../../../../shared/studio/licenses.js'
const {rows}=JSON.parse(readFileSync(new URL('./local-icons.json',import.meta.url),'utf8'))
const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export function localIcon(id) {
  const row=rows.find(row=>row.id===id)
  return row?{resource:{...iconSource(id),local:true},geometry:structuredClone(row.geometry)}:null
}
export function searchLocalIcons(q,page) {
  const words=normalize(q).split(/\s+/).filter(Boolean)
  return page===1?rows.filter(row=>words.every(word=>normalize(`${row.id} ${row.keywords}`).includes(word))).map(row=>localIcon(row.id).resource):[]
}
