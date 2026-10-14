import { Navigate, useLocation, useParams } from 'react-router-dom'

// Old public URLs (outside /app/p) redirect to their /app/p equivalent so links
// already shared, printed QR codes and installed mini apps keep working.
// `to` receives the route params, e.g. ({ token }) => `/app/p/custody/${token}`.
export function LegacyPublicRedirect({ to }) {
  const params = useParams()
  const { search, hash } = useLocation()
  return <Navigate to={`${to(params)}${search}${hash}`} replace />
}
