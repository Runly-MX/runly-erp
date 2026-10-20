import { useMemo } from 'react'
import { useGuestImportClient } from '../../hooks/useInventoryGuestCatalog.js'
import { capabilitiesFor, importAreaOptions } from '../../lib/guest-capabilities.js'
import { ImportDialogView } from '../item-import/ImportDialogView.jsx'

// The main Excel import dialog running against the supplier client. The destination folder is limited
// to folders where the supplier can import; catalogs are created only with the "crear modelos" capability.
export function GuestImportDialog({ open, onOpenChange, me }) {
  const client = useGuestImportClient()
  const areaOptions = useMemo(() => importAreaOptions(me), [me])
  return (
    <ImportDialogView open={open} onOpenChange={onOpenChange} client={client} areaOptions={areaOptions}
      canCreateCatalog={capabilitiesFor(me).canCreateModels} />
  )
}
