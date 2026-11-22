// Preserve physical input/motion queries. Only width-only media rules follow the Atlas page.
export function responsiveCss(css) {
  if(typeof css!=='string'||!css.includes('@media'))return css
  return css.replace(/@media\s*([^{}]+)\{/g,(rule,condition)=>{
    const width='\\(\\s*(?:min|max)-width\\s*:\\s*[\\d.]+px\\s*\\)'
    if(!new RegExp(`^\\s*${width}(?:\\s+(?:and|or)\\s+${width}|\\s*,\\s*${width})*\\s*$`).test(condition))return rule
    return `@container atlas-page ${condition.replace(/,\s*/g,' or ')}{`
  })
}
