// Offline verification: original binaries, licenses, real weights and Spanish glyphs.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {STUDIO_FONTS,STUDIO_FONT_VARIANTS,STUDIO_FONT_VARIANT_LABELS,studioFontStyle} from '../apps/shared/studio/fonts.js'

const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
function fontTables(bytes) {
  assert.equal(bytes.readUInt32BE(0),0x00010000,'Expected an original TrueType font')
  const tables=new Map()
  for(let n=0;n<bytes.readUInt16BE(4);n++) {
    const pos=12+n*16,start=bytes.readUInt32BE(pos+8),size=bytes.readUInt32BE(pos+12)
    assert.ok(start+size<=bytes.length,'Truncated font table')
    tables.set(bytes.toString('ascii',pos,pos+4),bytes.subarray(start,start+size))
  }
  return tables
}
function supportsGlyph(cmap,code) {
  for(let n=0;n<cmap.readUInt16BE(2);n++) {
    const pos=cmap.readUInt32BE(8+n*8),format=cmap.readUInt16BE(pos)
    if(format===12) {
      for(let i=0;i<cmap.readUInt32BE(pos+12);i++) {
        const group=pos+16+i*12,start=cmap.readUInt32BE(group),end=cmap.readUInt32BE(group+4)
        if(code>=start&&code<=end&&cmap.readUInt32BE(group+8)+code-start>0)return true
      }
    } else if(format===4&&code<=0xffff) {
      const segments=cmap.readUInt16BE(pos+6)/2,end=pos+14,start=end+segments*2+2,delta=start+segments*2,offset=delta+segments*2
      for(let i=0;i<segments;i++) {
        const first=cmap.readUInt16BE(start+i*2),last=cmap.readUInt16BE(end+i*2)
        if(code<first||code>last)continue
        const range=cmap.readUInt16BE(offset+i*2),shift=cmap.readInt16BE(delta+i*2)
        const glyph=range?cmap.readUInt16BE(offset+i*2+range+(code-first)*2):code
        if(glyph&&((glyph+shift)&0xffff))return true
      }
    }
  }
  return false
}
function weightRange(tables) {
  const variable=tables.get('fvar')
  if(variable) {
    const offset=variable.readUInt16BE(4),count=variable.readUInt16BE(8),size=variable.readUInt16BE(10)
    for(let n=0;n<count;n++) {
      const pos=offset+n*size
      if(variable.toString('ascii',pos,pos+4)==='wght')return [variable.readInt32BE(pos+4)/65536,variable.readInt32BE(pos+12)/65536]
    }
  }
  const weight=tables.get('OS/2').readUInt16BE(4)
  return [weight,weight]
}
export async function verifyStudioFonts() {
  const directory=new URL('../apps/desktop/public/studio-fonts/',import.meta.url)
  const manifest=JSON.parse(await readFile(new URL('sources.json',directory),'utf8'))
  assert.match(manifest.commit,/^[0-9a-f]{40}$/)
  const prefix=`https://raw.githubusercontent.com/google/fonts/${manifest.commit}/ofl/`
  const records=new Map(),licenses=new Map()
  const metadata=new Map(manifest.metadata.map(record=>[record.family,record]))
  for(const license of manifest.licenses) {
    assert.match(license.file,/^[a-z0-9-]+-OFL\.txt$/);assert.ok(license.source.startsWith(prefix))
    assert.match(license.sourceSha256,/^[0-9a-f]{64}$/)
    assert.ok(metadata.get(license.family)?.source.startsWith(prefix))
    assert.match(metadata.get(license.family).sha256,/^[0-9a-f]{64}$/)
    const text=await readFile(new URL(license.file,directory))
    assert.equal(hash(text),license.sha256,license.file)
    assert.match(text.toString(),/SIL OPEN FONT LICENSE Version 1\.1/)
    licenses.set(license.file,license)
  }
  let bytes=0,styles=0
  for(const entry of manifest.fonts) {
    assert.match(entry.file,/^[a-z0-9-]+\.ttf$/);assert.ok(entry.source.startsWith(prefix))
    assert.ok(!records.has(entry.file),'Duplicate font provenance')
    const data=await readFile(new URL(entry.file,directory))
    assert.equal(data.length,entry.bytes,entry.file);assert.equal(hash(data),entry.sha256,entry.file)
    assert.equal(entry.license,'OFL-1.1');assert.equal(licenses.get(entry.licenseFile)?.family,entry.family)
    const tables=fontTables(data),[min,max]=weightRange(tables)
    // Original static Lato/Poppins Thin/ExtraLight carry legacy OS/2 classes
    // 250/275. Google Fonts METADATA.pb maps these real faces to CSS 100/200.
    // Preserve the binary; do not rewrite its headers or synthesize the weight.
    if(!tables.has('fvar'))assert.equal(min===250?100:min===275?200:min,entry.weight,`${entry.file}: static CSS weight`)
    const italic=Boolean(tables.get('OS/2').readUInt16BE(62)&1)
    for(const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÁÉÍÓÚÜÑáéíóúüñ¡¿')assert.ok(supportsGlyph(tables.get('cmap'),char.codePointAt(0)),`${entry.file}: missing ${char}`)
    records.set(entry.file,{...entry,min:tables.has('fvar')?min:entry.weight,max:tables.has('fvar')?max:entry.weight,italic});bytes+=data.length
  }
  for(const font of STUDIO_FONTS) for(const variant of Object.keys(font.variants)) {
    const style=studioFontStyle(font.family,variant)
    assert.ok(style&&STUDIO_FONT_VARIANTS[variant]&&STUDIO_FONT_VARIANT_LABELS[variant],`${font.family}/${variant}`)
    styles++
    if(!style.file){assert.equal(font.family,'sans-serif');continue}
    const record=records.get(style.file)
    assert.equal(record?.family,font.family,style.file);assert.ok(record.variants.includes(variant),`${style.file}/${variant}`)
    assert.ok(style.weight>=record.min&&style.weight<=record.max,`${style.file}: ${style.weight} outside real ${record.min}..${record.max}`)
    assert.equal(style.style==='italic',record.italic,`${style.file}: incorrect italic descriptor`)
  }
  return {families:STUDIO_FONTS.length,files:records.size,styles,bytes,licenses:licenses.size,spanishGlyphs:true,realWeights:true}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyStudioFonts()))
