import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { retireDesignCaches } from './design-retirement.js'
const {QueryClient}=createRequire(new URL('../../../../package.json',import.meta.url))('@tanstack/react-query')
test('retirement updates Recent/Mine/all pages and clears the open design without touching another tenant',()=>{
  const client=new QueryClient(),scope=['tenant','owner']
  const keys=[['studio',...scope,'designs',1,'all',''],['studio',...scope,'designs',1,'mine',''],['studio',...scope,'designs',2,'all','query']]
  for(const key of keys)client.setQueryData(key,[{id:'retired'},{id:'keep'}])
  const other=['studio','other','owner','designs',1,'all','']
  client.setQueryData(other,[{id:'retired'}]);client.setQueryData(['studio',...scope,'design','retired'],{id:'retired'})
  retireDesignCaches(client,scope,'retired')
  for(const key of keys)assert.deepEqual(client.getQueryData(key),[{id:'keep'}])
  assert.deepEqual(client.getQueryData(other),[{id:'retired'}]);assert.equal(client.getQueryData(['studio',...scope,'design','retired']),undefined)
  client.clear()
})
