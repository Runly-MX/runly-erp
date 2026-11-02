import { POS_ADMIN_TOUCH } from './adminTouch.js'
import { SwitchField, SelectField, Label } from '@runly/ui'

const NO_STATION = '__none__'

export default function OutletFlagsFields({ value, onChange, stations = [] }) {
  const set = (patch) => onChange({ ...value, ...patch })

  return (
    <div className="flex flex-col gap-4">
      <SwitchField touchTarget
        id="outlet-allow-table-charge"
        label="Permitir cobro en mesa"
        description="Los meseros pueden cobrar desde su dispositivo; el efectivo se concilia con un corte de mesero."
        checked={Boolean(value.allowTableCharge)}
        onChange={(checked) => set({ allowTableCharge: checked })}
      />
      <div className="flex flex-col gap-1.5">
        <Label>Estación de cocina por defecto</Label>
        <SelectField contentClassName={POS_ADMIN_TOUCH}
          value={value.defaultStationId || NO_STATION}
          onChange={(v) => set({ defaultStationId: v === NO_STATION ? null : v })}
          placeholder="Sin estación por defecto"
          options={[
            { value: NO_STATION, label: 'Sin estación por defecto' },
            ...stations.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
      </div>
      <SwitchField touchTarget
        id="outlet-kitchen-kds-enabled"
        label="Pantalla de cocina (KDS)"
        description="Las comandas de esta sucursal se muestran en la pantalla de cocina."
        checked={Boolean(value.kitchenKdsEnabled)}
        onChange={(checked) => set({ kitchenKdsEnabled: checked })}
      />
      <SwitchField touchTarget
        id="outlet-kitchen-print-enabled"
        label="Impresión de comandas"
        description="Las comandas de esta sucursal se envían también a la impresora de cocina."
        checked={Boolean(value.kitchenPrintEnabled)}
        onChange={(checked) => set({ kitchenPrintEnabled: checked })}
      />
    </div>
  )
}
