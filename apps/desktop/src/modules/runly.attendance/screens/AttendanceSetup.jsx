import { Building2, CalendarClock, MapPin, Settings2, Target, Users, Wrench } from 'lucide-react'
import { ChipTabPanel, ChipTabs } from '@runly/ui'
import { GeneralSettings } from '../components/GeneralSettings.jsx'
import { CatalogManager } from '../components/CatalogManager.jsx'
import { PageShell, ScreenHeader } from '../components/shared.jsx'
import { useAttendancePermissions } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { usePersistedTab } from '../hooks/usePersistedTab.js'
import { CATALOGS, CATALOG_ORDER } from '../lib/catalogConfig.js'

const TAB_META = {
  sites: {
    icon: MapPin,
    description: 'Ubicaciones físicas (obra, planta, oficina) donde hay kioskos y se registran checadas. Cada sitio tiene su zona horaria, para que las horas y los turnos se calculen con el reloj correcto.',
  },
  groups: {
    icon: Building2,
    description: 'Empresas contratistas o áreas a las que pertenece cada persona. Son la base de las cuotas y permiten ver cuántos de cada grupo están presentes.',
  },
  categories: {
    icon: Wrench,
    description: 'Tipo de elemento u oficio (soldador, electricista, supervisor). Se usa para contar los mínimos requeridos por especialidad en las cuotas.',
  },
  shifts: {
    icon: CalendarClock,
    description: 'Horario esperado de entrada y salida, con minutos de tolerancia de llegada. Las checadas fuera de tolerancia se marcan como retardo.',
  },
  quotas: {
    icon: Target,
    description: 'Mínimo de personas por grupo, categoría o sitio que deben estar presentes. El Resumen y los Reportes comparan la presencia real contra estas cuotas.',
  },
}

const GENERAL_TAB = {
  value: 'general',
  label: 'General',
  icon: Settings2,
  description: 'Reglas generales de Asistencia: cuánto tiempo se conservan las fotos y ubicaciones de las checadas y si la foto es obligatoria.',
}
const TAB_VALUES = ['general', ...CATALOG_ORDER]
const TABS = [GENERAL_TAB, ...CATALOG_ORDER.map((kind) => ({ value: kind, label: CATALOGS[kind].label, icon: TAB_META[kind]?.icon ?? Users, description: TAB_META[kind]?.description }))]

export default function AttendanceSetup() {
  const lookups = useLookups()
  const { canConfigure } = useAttendancePermissions()
  const [tab, setTab] = usePersistedTab('attendance.setup.tab', TAB_VALUES, 'general')
  return (
    <PageShell>
      <ScreenHeader title="Configuración" description="Reglas generales y catálogos que usa Asistencia: dónde, quién, cuándo y cuántos." />
      <ChipTabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Catálogos de configuración" />
      <ChipTabPanel value="general" active={tab === 'general'}>
        <GeneralSettings canConfigure={canConfigure} />
      </ChipTabPanel>
      {CATALOG_ORDER.map((kind) => (
        <ChipTabPanel key={kind} value={kind} active={tab === kind}>
          <CatalogManager kind={kind} canConfigure={canConfigure} lookups={lookups} description={TAB_META[kind]?.description} />
        </ChipTabPanel>
      ))}
    </PageShell>
  )
}
