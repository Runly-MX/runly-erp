// apps/desktop/src/modules/runly.website/screens/WebsiteTemplateDetailScreen.jsx
// Legacy /templates/:id/detail route: the live preview + apply flow lives in
// TemplatePreviewScreen, so old links redirect there.
import { Navigate, useParams } from 'react-router-dom'

export default function WebsiteTemplateDetailScreen() {
  const { '*': wildcard } = useParams()
  const id = wildcard?.match(/^templates\/([^/]+)\/detail$/)?.[1] ?? null
  const to = id ? `/app/m/runly.website/templates/${id}/preview` : '/app/m/runly.website/templates'
  return <Navigate to={to} replace />
}
