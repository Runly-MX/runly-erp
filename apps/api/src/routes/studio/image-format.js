// Check raster signatures before handing untrusted bytes to an automatic decoder.
// A payload claiming image/png must never enter Sharp's SVG/XML loader.
export function isStudioRaster(bytes,mime) {
  if(!Buffer.isBuffer(bytes)||bytes.length<12)return false
  if(mime==='image/png')return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255
  if(mime==='image/webp')return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'
  return false
}
