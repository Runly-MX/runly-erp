// Browser cart for the store blocks. Lines hold display data only; the checkout endpoint re-derives price/name server side.
import { useEffect, useState } from 'react'
import { readAtlasConfig } from './catalogPublicClient.js'

const EVENT = 'runly-cart-change'
const keyFor = () => `runly-cart:${readAtlasConfig()?.siteId ?? 'site'}`

export function readCart() {
  try {
    const lines = JSON.parse(window.localStorage.getItem(keyFor()) ?? '[]')
    return Array.isArray(lines) ? lines.filter((l) => l?.productId && Number(l.qty) > 0) : []
  } catch { return [] }
}

function writeCart(lines) {
  try { window.localStorage.setItem(keyFor(), JSON.stringify(lines)) } catch { /* private mode: cart stays in memory only for this call */ }
  window.dispatchEvent(new Event(EVENT))
}

const same = (a, b) => a.productId === b.productId && (a.variantId ?? '') === (b.variantId ?? '')

export function addToCart(line, qty = 1) {
  const lines = readCart()
  const found = lines.find((l) => same(l, line))
  if (found) found.qty = Math.min(99, found.qty + qty)
  else lines.push({ productId: line.productId, variantId: line.variantId ?? '', name: line.name, slug: line.slug ?? '', price: Number(line.price) || 0, currency: line.currency ?? '', variantLabel: line.variantLabel ?? '', qty })
  writeCart(lines)
}

export function setQty(line, qty) {
  writeCart(readCart().map((l) => (same(l, line) ? { ...l, qty: Math.max(1, Math.min(99, qty)) } : l)))
}

export function removeLine(line) { writeCart(readCart().filter((l) => !same(l, line))) }
export function clearCart() { writeCart([]) }

export function useCartLines() {
  const [lines, setLines] = useState([])
  useEffect(() => {
    const sync = () => setLines(readCart())
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  return lines
}

export async function startCheckout(lines) {
  const cfg = readAtlasConfig()
  if (!cfg?.apiUrl || !cfg?.siteId) throw new Error('config-missing')
  const res = await fetch(`${cfg.apiUrl}/public/website/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Site-Id': cfg.siteId },
    body: JSON.stringify({ items: lines.map((l) => ({ productId: l.productId, ...(l.variantId ? { variantId: l.variantId } : {}), qty: l.qty })) }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !/^https:\/\//.test(json.url ?? '')) throw new Error(json.error || 'checkout-failed')
  window.location.assign(json.url)
}
