const id = (value) => encodeURIComponent(value)
const CATALOGS = ['sites', 'groups', 'categories', 'shifts', 'quotas']

export function createAttendanceDomain({ request, withAuthHeaders, toQueryString }) {
  const send = (method, path, data, token) => request(path, {
    method,
    headers: withAuthHeaders(token),
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  const api = {
    // Catalogs: kind is one of sites | groups | categories | shifts | quotas.
    listCatalog: (kind, token) => send('GET', `/attendance/${id(kind)}`, undefined, token),
    createCatalogItem: (kind, data, token) => send('POST', `/attendance/${id(kind)}`, data, token),
    updateCatalogItem: (kind, itemId, data, token) => send('PATCH', `/attendance/${id(kind)}/${id(itemId)}`, data, token),
    deleteCatalogItem: (kind, itemId, token) => send('DELETE', `/attendance/${id(kind)}/${id(itemId)}`, undefined, token),

    listPeople: (query, token) => send('GET', `/attendance/people${toQueryString(query)}`, undefined, token),
    createPerson: (data, token) => send('POST', '/attendance/people', data, token),
    updatePerson: (personId, data, token) => send('PATCH', `/attendance/people/${id(personId)}`, data, token),
    importPeopleFromHr: (token) => send('POST', '/attendance/people/import-hr', {}, token),
    geocode: (q, token) => send('GET', `/attendance/geocode${toQueryString({ q })}`, undefined, token),
    // HR link: suggest employees by name/code, link or unlink a person, create a person from an employee.
    searchHrSuggestions: (query, token) => send('GET', `/attendance/hr-suggestions${toQueryString(query)}`, undefined, token),
    linkHr: (personId, data, token) => send('POST', `/attendance/people/${id(personId)}/link-hr`, data, token),
    unlinkHr: (personId, token) => send('DELETE', `/attendance/people/${id(personId)}/link-hr`, undefined, token),
    createPersonFromHr: (hrEmployeeId, token) => send('POST', '/attendance/people/from-hr', { hrEmployeeId }, token),
    getEmployeeAttendance: (hrEmployeeId, token) => send('GET', `/attendance/employees/${id(hrEmployeeId)}`, undefined, token),
    createEnrollInvite: (personId, token) => send('POST', `/attendance/people/${id(personId)}/enroll-invite`, {}, token),
    addCard: (personId, data, token) => send('POST', `/attendance/people/${id(personId)}/cards`, data, token),
    revokeCredential: (credentialId, token) => send('POST', `/attendance/credentials/${id(credentialId)}/revoke`, {}, token),

    listPunches: (query, token) => send('GET', `/attendance/punches${toQueryString(query)}`, undefined, token),
    createManualPunch: (data, token) => send('POST', '/attendance/punches', data, token),
    voidPunch: (punchId, data, token) => send('POST', `/attendance/punches/${id(punchId)}/void`, data ?? {}, token),

    getSummary: (token) => send('GET', '/attendance/summary', undefined, token),
    getPresenceReport: (query, token) => send('GET', `/attendance/reports/presence${toQueryString(query)}`, undefined, token),
    getDaysReport: (query, token) => send('GET', `/attendance/reports/days${toQueryString(query)}`, undefined, token),
    reviewDay: (data, token) => send('POST', '/attendance/days/review', data, token),
    listCorrections: (query, token) => send('GET', `/attendance/corrections${toQueryString(query)}`, undefined, token),
    resolveCorrection: (correctionId, data, token) => send('POST', `/attendance/corrections/${id(correctionId)}/resolve`, data, token),
    getHoursReport: (query, token) => send('GET', `/attendance/reports/hours${toQueryString(query)}`, undefined, token),
    getComplianceReport: (query, token) => send('GET', `/attendance/reports/compliance${toQueryString(query)}`, undefined, token),

    getSettings: (token) => send('GET', '/attendance/settings', undefined, token),
    saveSettings: (data, token) => send('PATCH', '/attendance/settings', data, token),

    listKiosks: (token) => send('GET', '/attendance/kiosks', undefined, token),
    createKiosk: (data, token) => send('POST', '/attendance/kiosks', data, token),
    updateKiosk: (kioskId, data, token) => send('PATCH', `/attendance/kiosks/${id(kioskId)}`, data, token),
    approveKiosk: (kioskId, code, token) => send('POST', `/attendance/kiosks/${id(kioskId)}/approve`, { code }, token),
    resetKiosk: (kioskId, token) => send('POST', `/attendance/kiosks/${id(kioskId)}/reset`, {}, token),
    revokeKiosk: (kioskId, token) => send('POST', `/attendance/kiosks/${id(kioskId)}/revoke`, {}, token),
  }
  api.catalogKinds = CATALOGS
  return api
}
