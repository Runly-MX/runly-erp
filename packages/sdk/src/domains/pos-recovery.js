// Commerce backend contracts. Callers own a stable attempt key; this domain never
// generates a new key on retry and never queues money in the offline transport.
export function createPosRecoveryDomain({ request, withAuthHeaders, toQueryString }) {
  const path = (id) => encodeURIComponent(id);
  const get = (url, token) => request(`/pos/v2${url}`, { headers: withAuthHeaders(token), onlineOnly: true });
  const write = (url, data, token, options = {}, method = 'POST') => {
    if (!/^[\x21-\x7e]{16,128}$/.test(options.idempotencyKey ?? '')) {
      return Promise.reject(Object.assign(new Error('Falta una clave de intento válida.'), { code: 'IDEMPOTENCY_REQUIRED', status: 428 }));
    }
    return request(`/pos/v2${url}`, { method, headers: withAuthHeaders(token, { 'Idempotency-Key': options.idempotencyKey }),
      body: JSON.stringify(data), onlineOnly: true });
  };
  return {
    sellables:(query,token)=>get(`/sellables${toQueryString(query)}`,token),
    categories:(query,token)=>get(`/categories${toQueryString(query)}`,token),
    variants:(id,query,token)=>get(`/sellables/${path(id)}/variants${toQueryString(query)}`,token),
    scan:(query,token)=>get(`/scan${toQueryString(query)}`,token),
    refundPreview:(id,data,token)=>request(`/pos/v2/orders/${path(id)}/refunds/preview`,{method:'POST',headers:withAuthHeaders(token),body:JSON.stringify(data),onlineOnly:true}),
    context: (query, token) => get(`/context${toQueryString(query)}`, token),
    currentSession:(query,token)=>get(`/sessions/current${toQueryString(query)}`,token),
    getSession:(id,token)=>get(`/sessions/${path(id)}`,token),
    getReceipt:(id,token)=>get(`/receipts/${path(id)}`,token),
    createPrintJob:(id,data,token,options)=>write(`/receipts/${path(id)}/print-jobs`,data,token,options),
    finishPrintJob:(jobId,data,token,options)=>write(`/print-jobs/${path(jobId)}/result`,data,token,options),
    printDataBytes:(payload)=>{
      if(payload?.encoding!=='base64'||payload?.charset!=='US-ASCII'||typeof payload.dataBase64!=='string'||!payload.dataBase64.length||payload.dataBase64.length>2796204)throw Object.assign(new Error('Datos de impresión inválidos.'),{code:'VALIDATION_ERROR',status:400});
      let binary;
      try{binary=globalThis.atob(payload.dataBase64);}catch{throw Object.assign(new Error('Datos de impresión inválidos.'),{code:'VALIDATION_ERROR',status:400});}
      if(binary.length>2*1024*1024)throw Object.assign(new Error('Datos de impresión fuera de rango.'),{code:'VALIDATION_ERROR',status:400});
      return Uint8Array.from(binary,(c)=>c.charCodeAt(0));
    },
    getOrder: (id, token) => get(`/orders/${path(id)}`, token),
    listOrders: (query, token) => get(`/orders${toQueryString(query)}`, token),
    paymentMethods: (token) => get('/payment-methods', token),
    createOrder: (data, token, options) => write('/orders', data, token, options),
    addLine: (id, data, token, options) => write(`/orders/${path(id)}/lines`, data, token, options),
    updateLine: (id, lineId, data, token, options) => write(`/orders/${path(id)}/lines/${path(lineId)}`, data, token, options, 'PATCH'),
    deleteLine: (id, lineId, data, token, options) => write(`/orders/${path(id)}/lines/${path(lineId)}`, data, token, options, 'DELETE'),
    discount: (id, lineId, data, token, options) => write(`/orders/${path(id)}/lines/${path(lineId)}/discount`, data, token, options),
    addPayment: (id, data, token, options) => write(`/orders/${path(id)}/payments`, data, token, options),
    cancel: (id, data, token, options) => write(`/orders/${path(id)}/cancel`, data, token, options),
    refund: (id, data, token, options) => write(`/orders/${path(id)}/refunds`, data, token, options),
    openSession: (data, token, options) => write('/sessions/open', data, token, options),
    expectedCash: (id, token) => get(`/sessions/${path(id)}/expected-cash`, token),
    closeSession: (id, data, token, options) => write(`/sessions/${path(id)}/close`, data, token, options),
    cashMovement: (id, data, token, options) => write(`/sessions/${path(id)}/cash-movements`, data, token, options),
    listWaiterShifts: (query, token) => get(`/waiter-shifts${toQueryString(query)}`, token),
    openShift: (data, token, options) => write('/waiter-shifts/open', data, token, options),
    closeShift: (id, data, token, options) => write(`/waiter-shifts/${path(id)}/close`, data, token, options),
  };
}
