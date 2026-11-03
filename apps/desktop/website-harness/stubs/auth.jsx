// Harness stub for src/auth/AuthProvider.jsx. Permissions come from the page.
export function useAuth() {
  const permissions = (typeof window !== 'undefined' && window.__HARNESS_PERMS__) || []
  return {
    session: { access_token: 'harness-token' },
    userProfile: { isAdmin: false, permissions },
  }
}
