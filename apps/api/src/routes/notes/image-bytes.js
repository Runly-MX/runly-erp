import sharp from 'sharp'
import { detectImageType } from './append-images.js'

export async function noteImageBytes(bytes) {
  const type=detectImageType(bytes)
  if(type)return{bytes,mime:type.mime}
  // Preserve historical SVG/AVIF/TIFF uploads without serving active XML.
  // Self-contained SVG only; no local/network resource resolution or entities.
  const xml=bytes.toString('utf8')
  if(/<svg[\s>]/i.test(xml)) {
    const safeRefs=xml.replace(/(?:xlink:)?href\s*=\s*(["'])#[a-z0-9_.:-]+\1/gi,'')
      .replace(/url\(\s*#[a-z0-9_.:-]+\s*\)/gi,'')
    if(/<!|&|\\|(?:xlink:)?href\s*=|url\s*\(|@import|<script|<foreignObject|\son[a-z]+\s*=/i.test(safeRefs))
      throw Object.assign(Error('Imagen SVG no autocontenida.'),{status:415})
  }
  try {
    const rendered=await sharp(bytes,{limitInputPixels:40000000,failOn:'warning'}).timeout({seconds:5}).png().toBuffer()
    if(rendered.length>20*1024*1024)throw Error('Image too large')
    return{bytes:rendered,mime:'image/png'}
  } catch {throw Object.assign(Error('Formato de imagen no disponible.'),{status:415})}
}
