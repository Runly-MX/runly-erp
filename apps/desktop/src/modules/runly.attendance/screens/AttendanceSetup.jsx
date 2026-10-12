import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@runly/ui'
import { CatalogManager } from '../components/CatalogManager.jsx'
import { PageShell } from '../components/shared.jsx'
import { useAttendancePermissions } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { CATALOGS, CATALOG_ORDER } from '../lib/catalogConfig.js'

export default function AttendanceSetup() {
  const lookups = useLookups()
  const { canConfigure } = useAttendancePermissions()
  return (
    <PageShell>
      <PageHeader
        eyebrow="Asistencia"
        title="Configuración"
        description="Sitios, grupos, categorías, turnos y cuotas de cumplimiento."
      />
      <Tabs defaultValue="sites">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          {CATALOG_ORDER.map((kind) => <TabsTrigger key={kind} value={kind}>{CATALOGS[kind].label}</TabsTrigger>)}
        </TabsList>
        {CATALOG_ORDER.map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-4">
            <CatalogManager kind={kind} canConfigure={canConfigure} lookups={lookups} />
          </TabsContent>
        ))}
      </Tabs>
    </PageShell>
  )
}
