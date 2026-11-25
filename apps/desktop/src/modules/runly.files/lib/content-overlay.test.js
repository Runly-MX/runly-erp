import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchingWords,overlayRotation} from './content-overlay.js';
test('overlays use normalized search without rewriting recognized text',()=>{
  const word={text:'NÚMERO-ABC123',x:10,y:20,width:90,height:15};
  const result=matchingWords([{unit:2,words:[word]}],'numero');
  assert.equal(result.length,1);assert.equal(result[0].text,'NÚMERO-ABC123');assert.equal(result[0].unit,2);
  assert.equal(matchingWords([{unit:2,words:[word]}],'a').length,0);
});
test('overlay matches stop at their display ceiling without reading the remaining words',()=>{
  const words=Array.from({length:1001},()=>({text:'SERIE987',x:1,y:1,width:2,height:2}));
  Object.defineProperty(words,1000,{get(){throw Error('Unnecessary scan after display ceiling');}});
  assert.equal(matchingWords([{unit:1,words}],'serie987').length,1000);
});
test('PDF rotations share the original coordinate system and swap dimensions at quarter turns',()=>{
  assert.deepEqual(overlayRotation(600,800,90),{width:800,height:600,transform:'translate(800 0) rotate(90)'});
  assert.equal(overlayRotation(600,800,-90).transform,'translate(0 600) rotate(270)');
  assert.equal(overlayRotation(600,800,180).transform,'translate(600 800) rotate(180)');
  assert.equal(overlayRotation(600,800,360).transform,'');
});
