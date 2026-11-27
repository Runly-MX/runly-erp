import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canvasMatches,findMatches,lineRange,matchingWords,overlayRotation,selectionText} from './content-overlay.js';

const w=(text,x,y,width=60,height=20)=>({text,x,y,width,height});

test('overlays use normalized search without rewriting recognized text',()=>{
  const word=w('NÚMERO-ABC123',10,20,90,15);
  const result=matchingWords([{unit:2,words:[word]}],'numero');
  assert.equal(result.length,1);assert.equal(result[0].text,'NÚMERO-ABC123');assert.equal(result[0].unit,2);
  assert.equal(matchingWords([{unit:2,words:[word]}],'a').length,0);
});
test('an exact identifier matches case-insensitively and does not light unrelated words',()=>{
  const pages=[{unit:1,words:[w('Serial',0,0),w('FCW2849A07',70,0),w('FCW1111Z99',140,0)]}];
  const matches=findMatches(pages,'fcw2849a07');
  assert.equal(matches.length,1);assert.equal(matches[0].words[0].text,'FCW2849A07');
});
test('a phrase split across words is one match; reordered words are not',()=>{
  const pages=[{unit:1,words:[w('Service',0,0),w('Tag',70,0),w('ABC123XYZ',130,0),w('Tag',0,40),w('Service',70,40)]}];
  const matches=findMatches(pages,'service tag');
  assert.equal(matches.length,1);assert.deepEqual(matches[0].words.map(x=>x.index),[0,1]);
});
test('an identifier typed with a space still finds the single recognized word, and words split by OCR',()=>{
  assert.equal(findMatches([{unit:1,words:[w('FCW2849A07',0,0)]}],'FCW 2849A07').length,1);
  assert.equal(findMatches([{unit:1,words:[w('FCW-2849',0,0),w('A07',70,0)]}],'fcw 2849').length,1);
});
test('matches stop at the display ceiling',()=>{
  const words=Array.from({length:1500},(_,i)=>w('SERIE987',i,0));
  assert.equal(findMatches([{unit:1,words}],'serie987').length,1000);
});
test('selected words copy as the stored OCR text, with line breaks inferred geometrically',()=>{
  const words=[w('Serial',0,0),w('FCW0O1I',70,0),w('Modelo',0,40),w('AP-1',70,40)];
  assert.equal(selectionText(words,new Set([1,0])),'Serial FCW0O1I');           // O/0 and I/1 untouched, reading order
  assert.equal(selectionText(words,new Set([0,1,2,3])),'Serial FCW0O1I\nModelo AP-1');
  assert.deepEqual(lineRange(words,3),[2,3]);
});
test('PDF rotations share the original coordinate system and swap dimensions at quarter turns',()=>{
  assert.deepEqual(overlayRotation(600,800,90),{width:800,height:600,transform:'translate(800 0) rotate(90)'});
  assert.equal(overlayRotation(600,800,-90).transform,'translate(0 600) rotate(270)');
  assert.equal(overlayRotation(600,800,180).transform,'translate(600 800) rotate(180)');
  assert.equal(overlayRotation(600,800,360).transform,'');
});
test('coordinates are trusted only when the displayed bitmap matches the stored canvas',()=>{
  assert.equal(canvasMatches({width:1400,height:700},{w:700,h:350}),true);   // scaled copy
  assert.equal(canvasMatches({width:1400,height:700},{w:700,h:1400}),false); // EXIF turned it: do not draw
  assert.equal(canvasMatches(null,{w:1,h:1}),false);                         // legacy result without canvas
});
