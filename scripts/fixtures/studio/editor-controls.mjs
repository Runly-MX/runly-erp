// Semantic controls shared by the real Supabase browser suites after the editor redesign.
export async function openPanel(page,name) {
  if(await page.getByRole('dialog',{name,exact:true}).count())return
  const button=page.getByRole('navigation',{name:'Herramientas de diseño'}).getByRole('button',{name,exact:true})
  if(await button.getAttribute('aria-pressed')!=='true')await button.click()
}
export function layer(page,ordinal) {
  return page.getByRole('list',{name:'Capas del diseño'}).locator(`li:nth-last-child(${ordinal}) > button:not([aria-label]):not([role="checkbox"])`)
}
export async function selectLayer(page,ordinal) {await openPanel(page,'Capas');await layer(page,ordinal).click()}
export async function insertText(page) {await openPanel(page,'Texto');await page.getByRole('button',{name:'Añadir un título',exact:true}).click()}
export async function insertShape(page,type) {await openPanel(page,'Elementos');await page.getByRole('button',{name:type,exact:true}).click()}
export async function showFiles(page) {await openPanel(page,'Imágenes')}
export async function createBlank(page) {await page.getByRole('button',{name:/^Crear Publicación cuadrada,/}).click()}
export async function exportImage(page,format='PNG',quality='100 %') {
  await page.getByRole('button',{name:'Descargar',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Descargar',exact:true})
  await dialog.getByRole('radio',{name:new RegExp(`^${format}`)}).click()
  await dialog.getByRole('radio',{name:'×1',exact:true}).click()
  if(format==='PNG'){const box=dialog.getByRole('checkbox',{name:'Fondo transparente',exact:true});if(await box.isChecked())await dialog.getByText('Fondo transparente',{exact:true}).click()}
  await dialog.getByRole('button',{name:'Descargar',exact:true}).click()
  await page.getByRole('button',{name:`Exportar ${format}`,exact:true}).click()
}
export async function shareDialog(page) {
  await page.getByRole('button',{name:'Compartir',exact:true}).click()
  await page.getByRole('button',{name:'Continuar a compartir',exact:true}).click()
}
export async function openTemplates(page) {
  await page.getByRole('button',{name:/^Crear Publicación cuadrada,/}).waitFor()
  const sections=page.getByRole('navigation',{name:'Secciones de Studio'})
  if(await sections.count())await sections.getByRole('button',{name:'Plantillas',exact:true}).click()
}
export async function useTemplate(page) {
  await page.getByRole('button',{name:/^Usar (esta )?plantilla$/}).click()
}
export const properties=page=>page.getByRole('complementary',{name:'Propiedades',exact:true})
export async function presenceNames(page) {await page.getByRole('img',{name:/persona\(s\) editando/}).hover();return page.getByRole('tooltip').innerText()}
