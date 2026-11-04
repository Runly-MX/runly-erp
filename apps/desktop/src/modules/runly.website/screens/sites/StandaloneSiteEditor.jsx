import { useParams } from 'react-router-dom'
import SiteEditorScreen from './SiteEditorScreen.jsx'

// /app/editor/sites/:siteId/pages/:pageId — the same editor without the ERP shell.
export default function StandaloneSiteEditor() {
  const { siteId, pageId } = useParams()
  return <SiteEditorScreen key={`${siteId}:${pageId}`} siteId={siteId} pageId={pageId} standalone />
}
