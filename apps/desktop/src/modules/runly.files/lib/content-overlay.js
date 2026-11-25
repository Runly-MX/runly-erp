export function contentTerms(text) {
  return String(text??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word=>word.length>=2);
}
export function matchingWords(pages,query) {
  const terms=contentTerms(query);
  if (!terms.length) return [];
  return pages.flatMap(page=>(page.words??[]).map((word,index)=>({...word,unit:page.unit,index}))
    .filter(word=>contentTerms(word.text).some(value=>terms.some(term=>value.includes(term))))).slice(0,1000);
}
export function overlayRotation(width,height,rotation=0) {
  const angle=((rotation%360)+360)%360;
  if (angle===90) return {width:height,height:width,transform:`translate(${height} 0) rotate(90)`};
  if (angle===180) return {width,height,transform:`translate(${width} ${height}) rotate(180)`};
  if (angle===270) return {width:height,height:width,transform:`translate(0 ${width}) rotate(270)`};
  return {width,height,transform:''};
}
