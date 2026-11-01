import {Navigate,useSearchParams} from 'react-router-dom'

// Keep public/PWA paths and order deep links without mounting the obsolete
// local-price cart. Restaurant history is readable; operations stay phase 4.
export default function LegacyTerminalEntry(){
  const [query]=useSearchParams()
  const order=query.get('order')
  const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order??'')
  return <Navigate replace to={valid?`/app/m/runly.pos/pos/orders?order=${encodeURIComponent(order)}`:'/app/m/runly.pos/pos/caja'} />
}
