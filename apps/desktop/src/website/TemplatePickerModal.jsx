import { Button } from '@runly/ui'
import { X } from 'lucide-react'

export function TemplatePickerModal({ isOpen, onClose, token, siteId, onHomePageApplied }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Seleccionar plantilla</h2>
          <button type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-6">
          <p className="text-sm text-gray-600">
            Elige una plantilla para comenzar
          </p>
          <div className="grid gap-2">
            <div className="border rounded p-3 cursor-pointer hover:bg-gray-50">
              <p className="font-medium text-sm">Plantilla en blanco</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onClose}>
            Aplicar
          </Button>
        </div>
      </div>
    </div>
  )
}
