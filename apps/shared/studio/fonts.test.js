import test from 'node:test'
import assert from 'node:assert/strict'
import {STUDIO_FONTS,STUDIO_FONT_VARIANTS,studioFontStyle} from './fonts.js'
import {blankDocument,appendObject,validateDocument} from './document.js'
import {verifyStudioFonts} from '../../../scripts/verify-studio-fonts.mjs'

test('bundled typography matches immutable provenance, OFL licenses, real TTF weights/styles and Spanish glyphs',async()=>{
  const result=await verifyStudioFonts()
  assert.ok(result.families>=29);assert.ok(result.styles>=290)
})
test('full weight families offer thin through black, with genuine italic combinations',()=>{
  for(const family of ['Lato','Poppins','Montserrat','Inter','Roboto','DM Sans','Bitter'])for(const weight of [100,200,300,400,500,600,700,800,900])for(const style of ['normal','italic']) {
    const variant=Object.keys(STUDIO_FONT_VARIANTS).find(key=>STUDIO_FONT_VARIANTS[key].weight===weight&&STUDIO_FONT_VARIANTS[key].style===style)
    assert.ok(studioFontStyle(family,variant),`${family}/${variant}`)
  }
  assert.equal(studioFontStyle('Open Sans','thin'),null)
  assert.equal(studioFontStyle('Lora','extrabold'),null)
  assert.equal(studioFontStyle('Pacifico','bold'),null)
})
test('every declared family/style roundtrips with editable text at different sizes; unsupported styles fail closed',()=>{
  for(const font of STUDIO_FONTS)for(const fontVariant of Object.keys(font.variants))for(const fontSize of [8,48,144,500]) {
    const document=appendObject(blankDocument(),'text',{fontFamily:font.family,fontVariant,fontSize,text:'Árbol, pingüino y NIÑEZ ¿Sí?'})
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(document))),document)
  }
  assert.throws(()=>appendObject(blankDocument(),'text',{fontFamily:'Inter',fontVariant:'fake-bold'}))
})
