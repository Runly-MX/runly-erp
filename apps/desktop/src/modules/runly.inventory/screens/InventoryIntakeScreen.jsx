import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { InventorySmartForm } from '../components/InventorySmartForm.jsx'

export default function InventoryIntakeScreen() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const back = () => navigate('/app/m/runly.inventory/inventory')
  return <div className="space-y-6 px-4 pb-24 md:px-6">
    <PageHeader onBack={back} backLabel="Inventario" eyebrow="Inventario" title="Registro con IA y captura masiva"
      description="Carga fotos o captura series con tu lector. Revisa los datos de cada equipo antes de crearlos." />
    <InventorySmartForm key={`${activeCompanyId}:${session?.user?.id}`} token={session?.access_token}
      companyId={activeCompanyId} apiBaseUrl={getApiUrl()} onCancel={back} />
  </div>
}
