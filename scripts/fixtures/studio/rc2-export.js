import {createStudioEditor} from '../../../apps/desktop/src/modules/runly.studio/lib/fabric-adapter.js'
import {blankDocument} from '../../../apps/shared/studio/document.js'
const check=(ok,message)=>{if(!ok)throw Error(message)}
const element=()=>{const c=document.createElement('canvas');document.body.append(c);return c}
async function sample(blob,x,y){const image=await createImageBitmap(blob),c=element();c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);const pixel=[...c.getContext('2d').getImageData(x,y,1,1).data];image.close();c.remove();return pixel}
window.rc2ExportVerification=async()=>{
  const original=element();original.width=100;original.height=60;original.getContext('2d').fillStyle='#f59e0b';original.getContext('2d').fillRect(0,0,100,60)
  const options={resolveImage:async()=>original.toDataURL()},editor=await createStudioEditor(element(),{document:blankDocument(640,480),...options}),checks=[]
  await editor.setPageGradient({type:'gradient',gradientType:'linear',angle:0,stops:[{offset:0,color:'#00ff00',opacity:0.2},{offset:1,color:'#00ff00',opacity:0.2}]})
  await editor.add('rectangle',{id:'alpha',x:40,y:40,width:120,height:80,opacity:0.5,fillPaint:{type:'gradient',gradientType:'linear',angle:30,stops:[{offset:0,color:'#ff0000',opacity:0.5},{offset:1,color:'#ff0000',opacity:0.5}]}})
  await editor.add('image',{id:'photo',x:250,y:40,width:120,height:120,fileAssetId:'00000000-0000-4000-8000-000000000001',image:{mask:'star'}})
  await editor.add('text',{id:'text',x:40,y:200,width:300,height:60,text:'Studio RC2',fontFamily:'Lato',fontVariant:'bold',fontSize:32,fill:'#111111'})
  await editor.add('rectangle',{id:'outside',x:-20,y:300,width:40,height:60,fill:'#123456'})
  editor.selectMany(['alpha','photo']);editor.group()
  const scene=editor.snapshot(),files=[]
  for(const scale of [1,2,3])for(const format of ['png','jpg']){
    const blob=await editor.exportImage(format,1,scene,{scale,transparent:format==='png'}),image=await createImageBitmap(blob)
    check(image.width===640*scale&&image.height===480*scale,'Wrong requested dimensions');image.close()
    const clear=await sample(blob,600*scale,20*scale),alpha=await sample(blob,80*scale,80*scale),outside=await sample(blob,5*scale,315*scale),photo=await sample(blob,310*scale,100*scale)
    if(format==='png'){check(clear[3]===0,'PNG transparency missing');check(Math.abs(alpha[3]-64)<=1,'Stop opacity × element opacity mismatch')}
    else {check(clear[3]===255&&Math.abs(clear[0]-204)<=3&&clear[1]>=252&&Math.abs(clear[2]-204)<=3,'JPG matte/translucent page mismatch')}
    check(Math.abs(outside[0]-18)<=3&&Math.abs(outside[1]-52)<=3,'Outside-page crop mismatch');check(photo[0]>235&&photo[1]>140,'Masked original missing')
    files.push({format,scale,bytes:blob.size,width:640*scale,height:480*scale,clear,alpha})
  }
  check(JSON.stringify(editor.snapshot())===JSON.stringify(scene),'Export mutated document/history')
  checks.push('PNG/JPG x1/x2/x3 decoded, exact dimensions, transparent gradient alpha, JPG matte, local font, group, masked photo, off-page crop')
  await editor.resize({width:4096,height:4096,background:'#ffffff'})
  let rejected=false;try{await editor.exportImage('png',1,undefined,{scale:3})}catch(e){rejected=/80 megap/.test(e.message)}check(rejected,'Oversized export was silently reduced')
  const large=await editor.exportImage('png',1,undefined,{scale:1}),bitmap=await createImageBitmap(large);check(bitmap.width===4096&&bitmap.height===4096,'Large render reduced');bitmap.close()
  checks.push('4096² real render and explicit rejection of 4096² x3 without downsampling')
  await editor.destroy();original.remove();return {checks,files,largeBytes:large.size}
}
