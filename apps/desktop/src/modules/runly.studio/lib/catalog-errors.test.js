import test from 'node:test'
import assert from 'node:assert/strict'
import {catalogError}from'./catalog-errors.js'
test('catalog errors distinguish offline, quota, timeout, provider and licensing without treating errors as empty results',()=>{
  assert.equal(catalogError({},true).title,'Sin conexión')
  assert.equal(catalogError({status:429},false).title,'Límite de solicitudes')
  assert.equal(catalogError({status:504},false).title,'Tiempo de espera agotado')
  assert.equal(catalogError({status:502},false).title,'Proveedor no disponible')
  assert.equal(catalogError({status:403,details:{code:'CATALOG_LICENSE_DENIED'}},false).title,'Licencia no compatible')
})
