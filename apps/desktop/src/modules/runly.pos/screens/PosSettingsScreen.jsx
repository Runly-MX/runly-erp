import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChefHat, CreditCard, LayoutGrid, MonitorSmartphone, Pencil, Store } from 'lucide-react'
import {
  PageHeader, Card, CardContent, CardHeader, CardTitle, CardDescription,
  Button, EmptyState, ErrorState, Skeleton, Separator, StatusPill as UiStatusPill,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Tabs, TabsList, TabsTrigger, TabsContent,
  TextField, SelectField, SwitchField, SwatchField, Label,
} from '@runly/ui'
import {
  usePosSettings, useUpdatePosSettings,
  usePosOutlets, useCreatePosOutlet, useUpdatePosOutlet,
  usePosTerminals, useCreatePosTerminal, useUpdatePosTerminal,
  usePosStations, useCreatePosStation, useUpdatePosStation,
  usePosPaymentMethods, useCreatePosPaymentMethod, useUpdatePosPaymentMethod,
} from '../hooks/usePosSettings'
import OutletFlagsFields from '../components/OutletFlagsFields.jsx'
import PosModifiersTab from '../components/PosModifiersTab.jsx'
import ProductStationsPanel from '../components/ProductStationsPanel.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { useAuth } from '../../../auth/AuthProvider'
import { settingsPatch } from '../lib/posSettings.js'
import { POS_ADMIN_TOUCH } from '../components/adminTouch.js'
import { ModeTiles } from '../retail/components/PosQuickSetup.jsx'
import PosDeviceAccess from '../components/PosDeviceAccess.jsx'

// The operating screens' default orange (pos-theme.css) first, then common brand colors.
const POS_DEFAULT_ACCENT = '#F5411E'
const POS_ACCENT_SWATCHES = [POS_DEFAULT_ACCENT, '#E11D48', '#D97706', '#16A34A', '#008C8C', '#0A7BFF', '#4F46E5', '#7C3AED', '#0F172A']

function StatusPill({ active }) {
  return <UiStatusPill tone={active ? 'success' : 'neutral'}>{active ? 'Activa' : 'Inactiva'}</UiStatusPill>
}

function PosSettingsView() {
  const [tab, setTab] = useState('general')
  const { data: settings } = usePosSettings()
  const { data: outlets = [] } = usePosOutlets()
  // Restaurant tools only show when the business (or any outlet) serves tables.
  const restaurant = (settings?.mode ?? 'RESTAURANT') !== 'RETAIL' || outlets.some((o) => ['RESTAURANT', 'HYBRID'].includes(o.mode))
  return (
    <div className={`min-h-full bg-[hsl(var(--background))] p-4 sm:p-6 lg:p-8 ${POS_ADMIN_TOUCH}`}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <PageHeader
          title="Administración del punto de venta"
          description="Tu negocio, sus sucursales, cajas y formas de pago. Lo de restaurante aparece solo si lo necesitas."
        />
        <Tabs value={restaurant || tab !== 'restaurant' ? tab : 'general'} onValueChange={setTab}>
          <div className="overflow-x-auto pb-0.5">
            <TabsList className="mb-2 w-full min-w-max">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="cajas">
                <span className="sm:hidden">Cajas</span>
                <span className="hidden sm:inline">Cajas y pagos</span>
              </TabsTrigger>
              <TabsTrigger value="links">
                <span className="sm:hidden">Enlaces</span>
                <span className="hidden sm:inline">Cajas por enlace</span>
              </TabsTrigger>
              {restaurant && <TabsTrigger value="restaurant">Restaurante</TabsTrigger>}
              <TabsTrigger value="advanced">Avanzado</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="general">
            <div className="flex flex-col gap-6">
              <GeneralTab part="general" />
              <OutletsTab section="outlets" />
            </div>
          </TabsContent>
          <TabsContent value="cajas">
            <div className="flex flex-col gap-6">
              <OutletsTab section="terminals" />
              <PaymentMethodsTab />
            </div>
          </TabsContent>
          {/* Like Asistencia's kiosks: each register opens apart at /app/p/pos/<link>, outside the ERP. */}
          <TabsContent value="links"><PosDeviceAccess /></TabsContent>
          {restaurant && <TabsContent value="restaurant"><RestaurantAdmin onEditOutlets={() => setTab('general')} /></TabsContent>}
          <TabsContent value="advanced"><GeneralTab part="advanced" /></TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default function PosSettingsScreen() {
  const {activeCompanyId}=useActiveCompany()
  const {userProfile}=useAuth()
  return <PosSettingsView key={`${userProfile?.id}:${activeCompanyId}`} />
}

// Everything that only matters for table service. None of it is required to
// operate: tables can be created from Mesas and the floor plan is optional.
function RestaurantAdmin({ onEditOutlets }) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Mesas</CardTitle>
          <CardDescription>Se crean con un nombre y su capacidad desde la pantalla de Mesas; no necesitas un plano.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate('/app/m/runly.pos/pos/tables')}>Ir a Mesas</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Comandero y preparación</CardTitle>
          <CardDescription>Pantalla de cocina, impresión de comandas, estación por defecto y cobro en mesa se definen en cada sucursal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onEditOutlets}>Editar sucursales</Button>
        </CardContent>
      </Card>
      <StationsTab />
      <PosModifiersTab />
      <Card>
        <CardHeader>
          <CardTitle>Plano del salón (opcional)</CardTitle>
          <CardDescription>Dibuja tu salón si quieres verlo como plano. No hace falta para tomar pedidos ni cobrar.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate('/app/m/runly.pos/pos/admin/planos')}><LayoutGrid size={16} />Editor de planos</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// part: 'general' (business mode, tips) or 'advanced' (default tax rate).
function GeneralTab({ part = 'general' }) {
  const { data: settings, isLoading, isError, error, refetch } = usePosSettings()
  const update = useUpdatePosSettings()
  const [mode, setMode] = useState(null)
  const [tipsEnabled, setTipsEnabled] = useState(null)
  const [taxRate, setTaxRate] = useState(null)
  const [appointments, setAppointments] = useState(null)
  const [accent, setAccent] = useState(null)

  const currentMode = mode ?? settings?.mode ?? ''
  const currentTips = tipsEnabled ?? settings?.tipsEnabled ?? false
  const currentTaxRate = taxRate ?? (settings?.defaultTaxRate == null ? '' : String(settings.defaultTaxRate))
  const currentAccent = accent ?? settings?.accentColor ?? ''
  let patch = {}, validationError = null
  try { patch = settingsPatch(part, {mode,tipsEnabled,taxRate,appointmentsEnabled:appointments,accentColor:accent}) } catch (e) { validationError = e.message }

  if (isLoading) return <Skeleton className="h-48" aria-label="Cargando configuración" />
  if (isError) return <ErrorState title="No se pudo cargar la configuración" description={error?.message} onRetry={refetch} />

  return (
    <Card>
      <CardHeader>
        <CardTitle>{part === 'general' ? 'Tu negocio' : 'Opciones avanzadas'}</CardTitle>
        <CardDescription>{part === 'general' ? 'Cómo vendes: define qué pantallas se ofrecen en el punto de venta.' : 'Reglas poco frecuentes. Cámbialas solo si sabes que las necesitas.'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {part === 'general' && (<>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">Cómo vendes</p>
          <ModeTiles value={currentMode} onChange={setMode} disabled={update.isPending} />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Se aplica a todas las sucursales. Tienda oculta mesas, Comandero y Cocina.</p>
        </div>
        <Separator />
        <SwitchField touchTarget
          id="tips-enabled"
          label="Propinas habilitadas"
          description="Permite que los operadores registren propinas al momento del cobro."
          checked={currentTips}
          onChange={setTipsEnabled}
        />
        <SwitchField touchTarget
          id="appointments-enabled"
          label="Citas"
          description="Agenda citas con cliente y servicios, y cóbralas desde la caja. Se ven también en el calendario."
          checked={appointments ?? settings?.appointmentsEnabled ?? false}
          onChange={setAppointments}
        />
        <Separator />
        <div className="flex flex-col gap-3">
          <SwatchField
            id="pos-accent"
            label="Color de la caja"
            hint="Botones y acentos de Caja, Comandero, Cocina y las cajas abiertas por enlace. La administración conserva los colores de Runly."
            value={currentAccent || POS_DEFAULT_ACCENT}
            onChange={setAccent}
            swatches={POS_ACCENT_SWATCHES}
            disabled={update.isPending}
          />
          <div className="flex flex-wrap items-end gap-3">
            <TextField
              id="pos-accent-hex"
              label="Color personalizado"
              value={currentAccent}
              onChange={(e) => setAccent(e.target.value)}
              placeholder={POS_DEFAULT_ACCENT}
              maxLength={7}
              className="w-40"
            />
            {currentAccent && <Button variant="outline" onClick={() => setAccent('')} disabled={update.isPending}>Usar el naranja predeterminado</Button>}
          </div>
        </div>
        </>)}
        {part === 'advanced' && (
        <TextField
          label="Tasa de impuesto (%)"
          type="number"
          min={0}
          max={100}
          step={0.01}
          value={currentTaxRate}
          onChange={(e) => setTaxRate(e.target.value)}
          placeholder="0"
          hint="Aplica a todas las líneas de orden. Usa 0 para deshabilitar el IVA."
        />
        )}
        {validationError && <p role="alert" className="text-sm text-destructive">{validationError}</p>}
        <div className="flex justify-end">
          <Button
            onClick={() => update.mutate(patch, {onSuccess:()=>{setMode(null);setTipsEnabled(null);setTaxRate(null);setAppointments(null);setAccent(null)}})}
            disabled={update.isPending || Boolean(validationError) || !Object.keys(patch).length}
          >
            {update.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// section: 'outlets' | 'terminals' | 'both' (the admin screen shows them apart).
function OutletsTab({ section = 'both' }) {
  const { data: outlets = [], isLoading: loadingOutlets } = usePosOutlets()
  const { data: terminals = [], isLoading: loadingTerminals } = usePosTerminals()
  const createOutlet = useCreatePosOutlet()
  const updateOutlet = useUpdatePosOutlet()
  const createTerminal = useCreatePosTerminal()
  const updateTerminal = useUpdatePosTerminal()

  // Create outlet
  const [outletDialog, setOutletDialog] = useState(false)
  const [outletName, setOutletName] = useState('')
  const [outletCode, setOutletCode] = useState('')

  // Edit outlet
  const [editingOutlet, setEditingOutlet] = useState(null)
  const [editOutletName, setEditOutletName] = useState('')
  const [editOutletCode, setEditOutletCode] = useState('')
  const [editOutletEnabled, setEditOutletEnabled] = useState(true)
  const [editOutletFlags, setEditOutletFlags] = useState({
    allowTableCharge: false,
    defaultStationId: null,
    kitchenKdsEnabled: true,
    kitchenPrintEnabled: false,
  })
  const { data: editOutletStations = [] } = usePosStations(
    editingOutlet ? { outletId: editingOutlet.id } : {},
  )

  // Create terminal
  const [terminalDialog, setTerminalDialog] = useState(false)
  const [terminalName, setTerminalName] = useState('')
  const [terminalCode, setTerminalCode] = useState('')
  const [terminalOutletId, setTerminalOutletId] = useState('')

  // Edit terminal
  const [editingTerminal, setEditingTerminal] = useState(null)
  const [editTerminalName, setEditTerminalName] = useState('')
  const [editTerminalCode, setEditTerminalCode] = useState('')
  const [editTerminalEnabled, setEditTerminalEnabled] = useState(true)

  // Filter
  const [terminalFilter, setTerminalFilter] = useState('__all__')

  function openEditOutlet(o) {
    setEditingOutlet(o)
    setEditOutletName(o.name)
    setEditOutletCode(o.code ?? '')
    setEditOutletEnabled(o.enabled)
    setEditOutletFlags({
      allowTableCharge: Boolean(o.allowTableCharge),
      defaultStationId: o.defaultStationId ?? null,
      kitchenKdsEnabled: Boolean(o.kitchenKdsEnabled),
      kitchenPrintEnabled: Boolean(o.kitchenPrintEnabled),
    })
  }

  function openEditTerminal(t) {
    setEditingTerminal(t)
    setEditTerminalName(t.name)
    setEditTerminalCode(t.code ?? '')
    setEditTerminalEnabled(t.enabled)
  }

  function handleCreateOutlet() {
    createOutlet.mutate({ name: outletName, code: outletCode || undefined }, {
      onSuccess: () => { setOutletDialog(false); setOutletName(''); setOutletCode('') },
    })
  }

  function handleUpdateOutlet() {
    updateOutlet.mutate(
      {
        id: editingOutlet.id,
        name: editOutletName,
        code: editOutletCode || null,
        enabled: editOutletEnabled,
        ...editOutletFlags,
      },
      { onSuccess: () => setEditingOutlet(null) },
    )
  }

  function handleCreateTerminal() {
    createTerminal.mutate(
      { name: terminalName, code: terminalCode || undefined, outletId: terminalOutletId },
      { onSuccess: () => { setTerminalDialog(false); setTerminalName(''); setTerminalCode(''); setTerminalOutletId('') } },
    )
  }

  function handleUpdateTerminal() {
    updateTerminal.mutate(
      { id: editingTerminal.id, name: editTerminalName, code: editTerminalCode || null, enabled: editTerminalEnabled },
      { onSuccess: () => setEditingTerminal(null) },
    )
  }

  const filteredTerminals = terminalFilter && terminalFilter !== '__all__'
    ? terminals.filter((t) => t.outletId === terminalFilter)
    : terminals

  return (
    <div className="flex flex-col gap-6">
      {/* Outlets card */}
      {section !== 'terminals' && (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Sucursales</CardTitle>
            <CardDescription>Ubicaciones físicas desde las que opera el POS.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOutletDialog(true)}>+ Nueva sucursal</Button>
        </CardHeader>
        <CardContent>
          {loadingOutlets ? (
            <p className="text-sm text-muted-foreground">Cargando sucursales...</p>
          ) : outlets.length === 0 ? (
            <EmptyState title="Sin sucursales" description="Crea la primera sucursal para continuar." />
          ) : (
            <ul className="divide-y divide-border">
              {outlets.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-3.5">
                  <div>
                    <p className="text-sm font-medium">{o.name}</p>
                    {o.code && <p className="text-xs text-muted-foreground mt-0.5">Código: {o.code}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill active={o.enabled} />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditOutlet(o)}
                      aria-label={`Editar sucursal ${o.name}`}
                    >
                      <Pencil size={14} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      )}

      {/* Terminals card */}
      {section !== 'outlets' && (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Terminales</CardTitle>
            <CardDescription>Puntos de cobro asignados a cada sucursal.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setTerminalDialog(true)} disabled={outlets.length === 0}>
            + Nueva terminal
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {outlets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Filtrar por sucursal</Label>
              <SelectField contentClassName={POS_ADMIN_TOUCH}
                value={terminalFilter}
                onChange={setTerminalFilter}
                options={[
                  { value: '__all__', label: 'Todas las sucursales' },
                  ...outlets.map((o) => ({ value: o.id, label: o.name })),
                ]}
              />
            </div>
          )}
          {loadingTerminals ? (
            <p className="text-sm text-muted-foreground">Cargando terminales...</p>
          ) : filteredTerminals.length === 0 ? (
            <EmptyState title="Sin terminales" description="Crea una terminal para cada punto de venta." />
          ) : (
            <ul className="divide-y divide-border">
              {filteredTerminals.map((t) => {
                const outlet = outlets.find((o) => o.id === t.outletId)
                return (
                  <li key={t.id} className="flex items-center justify-between py-3.5">
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {outlet?.name ?? '—'}{t.code ? ` · ${t.code}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill active={t.enabled} />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditTerminal(t)}
                        aria-label={`Editar terminal ${t.name}`}
                      >
                        <Pencil size={14} />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      )}

      {/* Create outlet dialog */}
      <Dialog open={outletDialog} onOpenChange={setOutletDialog}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={Store}>
            <DialogTitle>Nueva sucursal</DialogTitle>
            <DialogDescription>Registra una ubicación física para el punto de venta.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateOutlet() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre de la sucursal"
              required
              placeholder="Ej. Sucursal Centro"
              value={outletName}
              onChange={(e) => setOutletName(e.target.value)}
            />
            <TextField
              label="Código"
              placeholder="Ej. SUC-01 (opcional)"
              value={outletCode}
              onChange={(e) => setOutletCode(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOutletDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={!outletName || createOutlet.isPending}>
                {createOutlet.isPending ? 'Creando...' : 'Crear sucursal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit outlet dialog */}
      <Dialog open={Boolean(editingOutlet)} onOpenChange={(v) => !v && setEditingOutlet(null)}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={Store}>
            <DialogTitle>Editar sucursal</DialogTitle>
            <DialogDescription>Modifica el nombre, código o estado de la sucursal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateOutlet() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre de la sucursal"
              required
              value={editOutletName}
              onChange={(e) => setEditOutletName(e.target.value)}
            />
            <TextField
              label="Código"
              placeholder="Opcional"
              value={editOutletCode}
              onChange={(e) => setEditOutletCode(e.target.value)}
            />
            <SwitchField touchTarget
              id="edit-outlet-enabled"
              label="Sucursal activa"
              description="Las sucursales inactivas no aparecen al abrir sesiones."
              checked={editOutletEnabled}
              onChange={setEditOutletEnabled}
            />
            <Separator />
            <OutletFlagsFields
              value={editOutletFlags}
              onChange={setEditOutletFlags}
              stations={editOutletStations}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingOutlet(null)}>Cancelar</Button>
              <Button type="submit" disabled={!editOutletName || updateOutlet.isPending}>
                {updateOutlet.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create terminal dialog */}
      <Dialog open={terminalDialog} onOpenChange={setTerminalDialog}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={MonitorSmartphone}>
            <DialogTitle>Nueva terminal</DialogTitle>
            <DialogDescription>Asigna una terminal a la sucursal correspondiente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreateTerminal() }} className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Sucursal</Label>
              <SelectField contentClassName={POS_ADMIN_TOUCH}
                value={terminalOutletId}
                onChange={setTerminalOutletId}
                options={outlets.map((o) => ({ value: o.id, label: o.name }))}
                placeholder="Selecciona una sucursal"
              />
            </div>
            <TextField
              label="Nombre de la terminal"
              required
              placeholder="Ej. Caja 1"
              value={terminalName}
              onChange={(e) => setTerminalName(e.target.value)}
            />
            <TextField
              label="Código"
              placeholder="Ej. CAJA-01 (opcional)"
              value={terminalCode}
              onChange={(e) => setTerminalCode(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setTerminalDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={!terminalName || !terminalOutletId || createTerminal.isPending}>
                {createTerminal.isPending ? 'Creando...' : 'Crear terminal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit terminal dialog */}
      <Dialog open={Boolean(editingTerminal)} onOpenChange={(v) => !v && setEditingTerminal(null)}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={MonitorSmartphone}>
            <DialogTitle>Editar terminal</DialogTitle>
            <DialogDescription>Modifica el nombre, código o estado de la terminal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdateTerminal() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre de la terminal"
              required
              value={editTerminalName}
              onChange={(e) => setEditTerminalName(e.target.value)}
            />
            <TextField
              label="Código"
              placeholder="Opcional"
              value={editTerminalCode}
              onChange={(e) => setEditTerminalCode(e.target.value)}
            />
            <SwitchField touchTarget
              id="edit-terminal-enabled"
              label="Terminal activa"
              description="Las terminales inactivas no aparecen al abrir sesiones."
              checked={editTerminalEnabled}
              onChange={setEditTerminalEnabled}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingTerminal(null)}>Cancelar</Button>
              <Button type="submit" disabled={!editTerminalName || updateTerminal.isPending}>
                {updateTerminal.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const KIND_OPTIONS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CARD', label: 'Tarjeta' },
  { value: 'TRANSFER', label: 'Transferencia' },
]
const KIND_LABELS = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' }

function PaymentMethodsTab() {
  const { data: methods = [], isLoading } = usePosPaymentMethods()
  const create = useCreatePosPaymentMethod()
  const update = useUpdatePosPaymentMethod()

  const [dialog, setDialog] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [kind, setKind] = useState('CASH')

  const [editingMethod, setEditingMethod] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editKind, setEditKind] = useState('CASH')
  const [editEnabled, setEditEnabled] = useState(true)

  function openEdit(m) {
    setEditingMethod(m)
    setEditName(m.name)
    setEditCode(m.code ?? '')
    setEditKind(m.kind)
    setEditEnabled(m.enabled)
  }

  function handleCreate() {
    create.mutate(
      { name, code, kind },
      { onSuccess: () => { setDialog(false); setName(''); setCode(''); setKind('CASH') } },
    )
  }

  function handleUpdate() {
    update.mutate(
      { id: editingMethod.id, name: editName, code: editCode, kind: editKind, enabled: editEnabled },
      { onSuccess: () => setEditingMethod(null) },
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Métodos de pago</CardTitle>
          <CardDescription>Efectivo, tarjeta, transferencia y otros métodos aceptados en el POS.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialog(true)}>+ Nuevo método</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando métodos de pago...</p>
        ) : methods.length === 0 ? (
          <EmptyState
            title="Sin métodos de pago"
            description="Crea al menos un método de pago para poder cobrar órdenes."
            action={{ label: 'Crear método', onClick: () => setDialog(true) }}
          />
        ) : (
          <ul className="divide-y divide-border">
            {methods.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {KIND_LABELS[m.kind] ?? m.kind}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill active={m.enabled} />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(m)}
                    aria-label={`Editar método ${m.name}`}
                  >
                    <Pencil size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Create dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={CreditCard}>
            <DialogTitle>Nuevo método de pago</DialogTitle>
            <DialogDescription>Define cómo los clientes pueden pagar en esta sucursal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre"
              required
              placeholder="Ej. Efectivo"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Código"
              required
              placeholder="Ej. CASH"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <SelectField contentClassName={POS_ADMIN_TOUCH} value={kind} onChange={setKind} options={KIND_OPTIONS} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={!name || !code || create.isPending}>
                {create.isPending ? 'Creando...' : 'Crear método'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={Boolean(editingMethod)} onOpenChange={(v) => !v && setEditingMethod(null)}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={CreditCard}>
            <DialogTitle>Editar método de pago</DialogTitle>
            <DialogDescription>Modifica el nombre, tipo o estado del método.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdate() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <TextField
              label="Código"
              required
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <SelectField contentClassName={POS_ADMIN_TOUCH} value={editKind} onChange={setEditKind} options={KIND_OPTIONS} />
            </div>
            <SwitchField touchTarget
              id="edit-pm-enabled"
              label="Método activo"
              description="Los métodos inactivos no aparecen al cobrar."
              checked={editEnabled}
              onChange={setEditEnabled}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingMethod(null)}>Cancelar</Button>
              <Button type="submit" disabled={!editName || !editCode || update.isPending}>
                {update.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function StationsTab() {
  const { data: outlets = [] } = usePosOutlets()
  const [outletId, setOutletId] = useState('')
  const query = outletId ? { outletId } : {}
  const { data: stations = [], isLoading } = usePosStations(query)
  const createStation = useCreatePosStation()
  const updateStation = useUpdatePosStation()

  // Create
  const [dialog, setDialog] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')

  // Edit
  const [editingStation, setEditingStation] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)

  function openEdit(s) {
    setEditingStation(s)
    setEditName(s.name)
    setEditCode(s.code ?? '')
    setEditEnabled(s.enabled)
  }

  function handleCreate() {
    createStation.mutate(
      { name, code, outletId },
      { onSuccess: () => { setDialog(false); setName(''); setCode('') } },
    )
  }

  function handleUpdate() {
    updateStation.mutate(
      { id: editingStation.id, name: editName, code: editCode, enabled: editEnabled },
      { onSuccess: () => setEditingStation(null) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Estaciones de preparación</CardTitle>
          <CardDescription>Cocina, barra, postres — cada área que recibe comandas.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialog(true)} disabled={!outletId}>
          + Nueva estación
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Filtrar por sucursal</Label>
          <SelectField contentClassName={POS_ADMIN_TOUCH}
            value={outletId}
            onChange={setOutletId}
            options={outlets.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Selecciona una sucursal"
          />
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando estaciones...</p>
        ) : stations.length === 0 ? (
          <EmptyState title="Sin estaciones" description="Crea estaciones como Cocina, Barra o Postres." />
        ) : (
          <ul className="divide-y divide-border">
            {stations.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3.5">
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.code && <p className="text-xs text-muted-foreground mt-0.5">Código: {s.code}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill active={s.enabled} />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(s)}
                    aria-label={`Editar estación ${s.name}`}
                  >
                    <Pencil size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Create station dialog */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={ChefHat}>
            <DialogTitle>Nueva estación</DialogTitle>
            <DialogDescription>Define un área de preparación que recibirá comandas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre de la estación"
              required
              placeholder="Ej. Cocina caliente"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextField
              label="Código"
              required
              placeholder="Ej. KITCHEN"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={!name || !code || createStation.isPending}>
                {createStation.isPending ? 'Creando...' : 'Crear estación'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit station dialog */}
      <Dialog open={Boolean(editingStation)} onOpenChange={(v) => !v && setEditingStation(null)}>
        <DialogContent size="md" className={POS_ADMIN_TOUCH}>
          <DialogHeader icon={ChefHat}>
            <DialogTitle>Editar estación</DialogTitle>
            <DialogDescription>Modifica el nombre, código o estado de la estación.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleUpdate() }} className="flex flex-col gap-4 py-2">
            <TextField
              label="Nombre de la estación"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <TextField
              label="Código"
              required
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
            />
            <SwitchField touchTarget
              id="edit-station-enabled"
              label="Estación activa"
              description="Las estaciones inactivas no reciben comandas."
              checked={editEnabled}
              onChange={setEditEnabled}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingStation(null)}>Cancelar</Button>
              <Button type="submit" disabled={!editName || !editCode || updateStation.isPending}>
                {updateStation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </Card>

      <ProductStationsPanel stations={stations} />
    </div>
  )
}
