// Harness stub for src/company/ActiveCompanyProvider.jsx.
export function useActiveCompany() {
  const activeCompanyId = (typeof window !== 'undefined' && window.__HARNESS_COMPANY__) || 'company-a'
  return { activeCompanyId }
}
