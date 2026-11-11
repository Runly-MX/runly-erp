// Host-owned runtime only. A template and an isolated Creator frame never supply ERP credentials.
let configuration = {}
export function configureWebsiteRuntime(value) { configuration = value ?? {} }
export function getApiUrl() { return configuration.getApiUrl?.() ?? (typeof window === 'undefined' ? '' : window.RUNLY_CONFIG?.apiUrl ?? '') }
