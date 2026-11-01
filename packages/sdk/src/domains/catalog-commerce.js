export function createCatalogCommerceDomain({request,withAuthHeaders,toQueryString}) {
  const product=(id)=>`/catalog/products/${encodeURIComponent(id)}`;
  const get=(path,token)=>request(path,{headers:withAuthHeaders(token),onlineOnly:true});
  const write=(path,data,token,options={},method='POST')=>{
    if(!/^[\x21-\x7e]{16,128}$/.test(options.idempotencyKey??''))return Promise.reject(Object.assign(new Error('Falta una clave de intento válida.'),{code:'IDEMPOTENCY_REQUIRED',status:428}));
    return request(path,{method,headers:withAuthHeaders(token,{'Idempotency-Key':options.idempotencyKey}),body:JSON.stringify(data),onlineOnly:true});
  };
  return {
    outlets:(token)=>get('/catalog/outlets',token),
    defaults:(token)=>get('/catalog/commercial-defaults',token),
    sellables:(query,token)=>get(`/catalog/sellables${toQueryString(query)}`,token),
    variants:(id,query,token)=>get(`/catalog/sellables/${encodeURIComponent(id)}/variants${toQueryString(query)}`,token),
    stockBalances:(id,query,token)=>get(`${product(id)}/stock-balances${toQueryString(query)}`,token),
    stockMovements:(id,query,token)=>get(`${product(id)}/stock-movements${toQueryString(query)}`,token),
    allocateStock:(id,data,token,options)=>write(`${product(id)}/stock-allocations`,data,token,options),
    adjustStock:(id,data,token,options)=>write(`${product(id)}/stock-movements`,data,token,options),
    availability:(id,query,token)=>get(`${product(id)}/pos-availability${toQueryString(query)}`,token),
    setAvailability:(id,data,token,options)=>write(`${product(id)}/pos-availability`,data,token,options,'PUT'),
    commercialTax:(id,token)=>get(`${product(id)}/commercial-tax`,token),
    setCommercialTax:(id,data,token,options)=>write(`${product(id)}/commercial-tax`,data,token,options,'PUT'),
  };
}
