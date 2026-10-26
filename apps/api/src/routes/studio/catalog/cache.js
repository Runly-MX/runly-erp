// Bounded process-local cache. Keys include tenant/actor; authorization precedes every read.
export function createCatalogCache({ clock=Date.now, ttl=60000, maxEntries=96, maxBytes=4*1024*1024 }={}) {
  const entries=new Map();let bytes=0
  function remove(key){bytes-=entries.get(key)?.size??0;entries.delete(key)}
  return {
    get(key){const row=entries.get(key);if(!row)return null;if(row.until<=clock()){remove(key);return null}return structuredClone(row.value)},
    set(key,value){const size=Buffer.byteLength(JSON.stringify(value));if(size>maxBytes)return;remove(key);for(const[k,row]of entries)if(row.until<=clock())remove(k);while(entries.size>=maxEntries||bytes+size>maxBytes)remove(entries.keys().next().value);entries.set(key,{value:structuredClone(value),size,until:clock()+ttl});bytes+=size},
    state:()=>({entries:entries.size,bytes}),
  }
}
