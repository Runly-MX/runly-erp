import { useState } from 'react'
import { Dices, Eye, EyeOff } from 'lucide-react'
import { Button, TextField } from '@runly/ui'
import { generatePin } from '../../lib/formHelpers.js'

// PIN input with show/hide and a "Generar" button (random 4 digits, no obvious sequences).
// A generated PIN is shown in clear so the admin can tell it to the person.
export function PinField({ value, onChange, error, hint, label = 'PIN (4 a 8 dígitos)' }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-1.5">
      <TextField
        label={label} type={visible ? 'text' : 'password'} inputMode="numeric" autoComplete="new-password" value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))} error={error} hint={hint}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => { onChange(generatePin()); setVisible(true) }}><Dices className="h-4 w-4" />Generar</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{visible ? 'Ocultar' : 'Mostrar'}
        </Button>
      </div>
    </div>
  )
}
