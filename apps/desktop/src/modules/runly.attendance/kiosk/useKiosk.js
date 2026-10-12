// State machine of the public kiosk: pairing -> roster cache -> offline punches
// -> outbox sync. All punch decisions run locally; the server re-validates on sync.
import { useCallback, useEffect, useRef, useState } from 'react'
import { kioskApi } from './lib/kiosk-api.js'
import { kioskDb } from './lib/kiosk-db.js'
import { deviceLabel, beep, haptic } from './lib/feedback.js'
import { uuidv7 } from './lib/uuidv7.js'
import {
  createPinThrottle, createReplayGuard, isDuplicatePunch, latestPunch, nextDirection, normalizeUid, parsePhonePayload, verifyPhonePayload, verifyPin,
} from './lib/punch-logic.js'

const RESULT_MS = 4_000
const SYNC_EVERY_MS = 20_000
const ROSTER_EVERY_MS = 5 * 60_000
const POLL_MS = 3_000
const BATCH = 200

const fullName = (p) => [p.firstName, p.lastName].filter(Boolean).join(' ')

export function useKiosk(link) {
  const [phase, setPhase] = useState('loading') // loading | pairing | ready | unavailable | revoked | already | offline
  const [pairing, setPairing] = useState(null)
  const [roster, setRoster] = useState(null)
  const [reachable, setReachable] = useState(true)
  const [browserOnline, setBrowserOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [pending, setPending] = useState(0)
  const [authIssue, setAuthIssue] = useState(null)
  const [rejectedLog, setRejectedLog] = useState([])
  const [result, setResult] = useState(null)

  const tokenRef = useRef(null)
  const secretRef = useRef(null)
  const rosterRef = useRef(null)
  const lastRef = useRef(new Map()) // personId -> { direction, occurredAt }
  const recentRef = useRef(new Map()) // personId -> ms of the last punch taken on this device
  const throttle = useRef(createPinThrottle())
  const replay = useRef(createReplayGuard())
  const syncing = useRef(false)
  const resultTimer = useRef(null)

  const refreshPending = useCallback(async () => {
    setPending((await kioskDb.listPunches(link)).length)
  }, [link])

  const applyRoster = useCallback((next) => {
    rosterRef.current = next
    setRoster(next)
    for (const person of next.people) {
      if (person.last) lastRef.current.set(person.id, latestPunch(lastRef.current.get(person.id), person.last))
    }
  }, [])

  const show = useCallback((value) => {
    clearTimeout(resultTimer.current)
    setResult({ ...value, key: Date.now() })
    resultTimer.current = setTimeout(() => setResult(null), RESULT_MS)
  }, [])
  const clearResult = useCallback(() => { clearTimeout(resultTimer.current); setResult(null) }, [])

  const fail = useCallback((message, title = 'No se pudo registrar') => {
    beep('reject'); haptic([60, 40, 60])
    show({ kind: 'reject', title, message })
  }, [show])

  // ---------- roster + sync ----------
  const handleAuthError = useCallback((error) => {
    if (error.status === 403) setAuthIssue('Kiosko revocado. Pide a un administrador que lo restablezca.')
    else if (error.status === 401 || error.status === 404) setAuthIssue('Kiosko no autorizado o revocado')
  }, [])

  const refreshRoster = useCallback(async () => {
    if (!tokenRef.current) return
    try {
      const next = await kioskApi.roster(link, tokenRef.current)
      await kioskDb.putRoster(link, next)
      applyRoster(next)
      setAuthIssue(null)
      setReachable(true)
    } catch (error) {
      if (error.status === 0) setReachable(false)
      else handleAuthError(error)
    }
  }, [link, applyRoster, handleAuthError])

  const syncNow = useCallback(async () => {
    if (syncing.current || !tokenRef.current || !navigator.onLine) return
    syncing.current = true
    let synced = false
    try {
      for (let round = 0; round < 20; round += 1) {
        const batch = (await kioskDb.listPunches(link)).slice(0, BATCH)
        if (!batch.length) break
        const payload = batch.map(({ id, personId, direction, method, proof, deviceTime, offline }) => ({ id, personId, direction, method, proof, deviceTime, offline }))
        const data = await kioskApi.sync(link, tokenRef.current, payload)
        setReachable(true)
        setAuthIssue(null)
        const accepted = (data.accepted ?? []).filter(Boolean)
        const rejected = (data.rejected ?? []).filter((r) => r?.id)
        await kioskDb.addRejected(link, rejected.map((r) => {
          const punch = batch.find((p) => p.id === r.id)
          const person = punch ? rosterRef.current?.people.find((p) => p.id === punch.personId) : null
          return { id: r.id, reason: r.reason, person: person ? fullName(person) : null, deviceTime: punch?.deviceTime ?? null }
        }))
        await kioskDb.deletePunches([...accepted, ...rejected.map((r) => r.id)])
        synced = true
        if (!accepted.length && !rejected.length) break
        if (batch.length < BATCH) break
      }
    } catch (error) {
      if (error.status === 0) setReachable(false)
      else handleAuthError(error) // the outbox is kept
    } finally {
      syncing.current = false
      await refreshPending()
      setRejectedLog(await kioskDb.listRejected(link))
    }
    if (synced) refreshRoster()
  }, [link, refreshPending, refreshRoster, handleAuthError])

  // ---------- pairing ----------
  const startPairing = useCallback(async () => {
    setPhase('loading')
    try {
      const info = await kioskApi.info(link)
      if (info.revoked) { setPhase('revoked'); return }
      if (info.paired) { setPhase('already'); return }
      const data = await kioskApi.requestPair(link, deviceLabel())
      secretRef.current = data.pollSecret
      setPairing({ code: data.code, kioskName: data.kioskName ?? info.name, expired: false })
      setPhase('pairing')
    } catch (error) {
      if (error.status === 404) setPhase('unavailable')
      else if (error.status === 403) setPhase('revoked')
      else if (error.status === 409) setPhase('already')
      else setPhase('offline')
    }
  }, [link])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const token = await kioskDb.getMeta(`token:${link}`).catch(() => null)
      if (cancelled) return
      if (!token) { startPairing(); return }
      tokenRef.current = token
      const cached = await kioskDb.getRoster(link).catch(() => null)
      const outbox = await kioskDb.listPunches(link).catch(() => [])
      for (const punch of outbox) {
        lastRef.current.set(punch.personId, latestPunch(lastRef.current.get(punch.personId), { direction: punch.direction, occurredAt: punch.deviceTime }))
        recentRef.current.set(punch.personId, Math.max(recentRef.current.get(punch.personId) ?? 0, new Date(punch.deviceTime).getTime()))
        const parsed = punch.method === 'phone_qr' ? parsePhonePayload(punch.proof) : null
        if (parsed) replay.current.add(parsed.personId, parsed.ts)
      }
      if (cached) applyRoster(cached)
      setPending(outbox.length)
      setRejectedLog(await kioskDb.listRejected(link).catch(() => []))
      setPhase('ready')
      refreshRoster()
      syncNow()
    })()
    return () => { cancelled = true }
  }, [link, startPairing, applyRoster, refreshRoster, syncNow])

  useEffect(() => {
    if (phase !== 'pairing' || pairing?.expired) return undefined
    let busy = false
    const id = setInterval(async () => {
      if (busy) return
      busy = true
      try {
        const data = await kioskApi.pairStatus(link, secretRef.current)
        if (data.status === 'paired') {
          clearInterval(id)
          await kioskDb.setMeta(`token:${link}`, data.deviceToken) // issued only once
          tokenRef.current = data.deviceToken
          setPhase('loading')
          await refreshRoster()
          setPhase('ready')
          syncNow()
        } else if (data.status === 'expired') {
          setPairing((p) => ({ ...p, expired: true }))
        } else if (data.code) {
          setPairing((p) => (p && p.code !== data.code ? { ...p, code: data.code } : p))
        }
      } catch (error) {
        if (error.status === 401) startPairing()
        else if (error.status === 403) setPhase('revoked')
        else if (error.status === 409) setPhase('already')
      } finally { busy = false }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [phase, pairing?.expired, link, refreshRoster, syncNow, startPairing])

  // ---------- background loops ----------
  useEffect(() => {
    if (phase !== 'ready') return undefined
    const onOnline = () => { setBrowserOnline(true); syncNow(); refreshRoster() }
    const onOffline = () => setBrowserOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const syncTimer = setInterval(syncNow, SYNC_EVERY_MS)
    const rosterTimer = setInterval(refreshRoster, ROSTER_EVERY_MS)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(syncTimer)
      clearInterval(rosterTimer)
    }
  }, [phase, syncNow, refreshRoster])

  useEffect(() => () => clearTimeout(resultTimer.current), [])

  // ---------- punches ----------
  const record = useCallback(async (person, method, proof) => {
    const now = Date.now()
    if (isDuplicatePunch(recentRef.current.get(person.id), now)) {
      beep('info')
      show({ kind: 'info', title: 'Ya registraste tu checada', person: fullName(person), group: groupName(rosterRef.current, person), message: 'Espera unos segundos antes de volver a checar.' })
      return false
    }
    const direction = nextDirection(lastRef.current.get(person.id), rosterRef.current?.kiosk?.mode ?? 'both', new Date(now))
    const punch = {
      id: uuidv7(now), link, personId: person.id, direction, method, proof: proof ?? null,
      deviceTime: new Date(now).toISOString(), offline: !navigator.onLine,
    }
    await kioskDb.putPunch(punch) // durable before anything else
    lastRef.current.set(person.id, { direction, occurredAt: punch.deviceTime })
    recentRef.current.set(person.id, now)
    setPending((n) => n + 1)
    beep(direction); haptic(direction === 'in' ? 40 : [30, 40, 30])
    show({ kind: direction, title: direction === 'in' ? 'Entrada registrada' : 'Salida registrada', person: fullName(person), group: groupName(rosterRef.current, person), time: punch.deviceTime, offline: punch.offline })
    syncNow()
    return true
  }, [link, show, syncNow])

  const submitPin = useCallback(async (code, pin) => {
    const people = rosterRef.current?.people
    if (!people) { fail('La lista de personal aún no se descarga. Conéctate a internet una vez.'); return false }
    const trimmed = String(code).trim()
    const locked = throttle.current.remainingMs(trimmed)
    if (locked) { fail(`Demasiados intentos. Espera ${Math.ceil(locked / 1000)} s.`, 'Código bloqueado'); return false }
    const person = people.find((p) => String(p.code).toLowerCase() === trimmed.toLowerCase())
    const ok = person?.pinHash ? await verifyPin(pin, person.pinHash) : false
    if (!ok) {
      const lock = throttle.current.fail(trimmed)
      fail(lock ? 'Demasiados intentos. Espera 30 s.' : person && !person.pinHash ? 'Esta persona no tiene PIN configurado.' : 'Código o PIN incorrecto.', 'Acceso rechazado')
      return false
    }
    throttle.current.success(trimmed)
    return record(person, 'pin', null)
  }, [fail, record])

  const submitQr = useCallback(async (text) => {
    const parsed = parsePhonePayload(text)
    const current = rosterRef.current
    if (!parsed) { fail('Ese código no es una llave de asistencia.', 'QR no válido'); return false }
    if (!current) { fail('La lista de personal aún no se descarga.'); return false }
    const person = current.people.find((p) => p.id === parsed.personId)
    if (!person) { fail('Esta persona no está en este kiosko.', 'QR no válido'); return false }
    if (replay.current.has(parsed.personId, parsed.ts)) { fail('Este código ya se usó. Espera a que cambie en tu teléfono.', 'Código repetido'); return false }
    const keys = current.keys.filter((k) => k.personId === parsed.personId)
    let verdict = { ok: false, reason: 'bad_signature' }
    for (const key of keys) {
      verdict = await verifyPhonePayload({ payload: parsed, jwk: key.jwk })
      if (verdict.ok) break
    }
    if (!verdict.ok) { fail(verdict.reason === 'expired' ? 'Código vencido. Usa el que muestra tu teléfono ahora.' : 'No se pudo verificar la llave del teléfono.', 'QR rechazado'); return false }
    replay.current.add(parsed.personId, parsed.ts)
    return record(person, 'phone_qr', String(text).trim())
  }, [fail, record])

  const submitCard = useCallback(async (uid) => {
    const current = rosterRef.current
    const normalized = normalizeUid(uid)
    const card = current?.cards.find((c) => normalizeUid(c.uid) === normalized)
    const person = card ? current.people.find((p) => p.id === card.personId) : null
    if (!person) { fail('Esta tarjeta no está registrada.', 'Tarjeta no válida'); return false }
    return record(person, 'card', normalized)
  }, [fail, record])

  useEffect(() => {
    if (phase !== 'ready') return undefined
    const onCard = (event) => { if (event.detail?.uid) submitCard(event.detail.uid) }
    window.addEventListener('runly:nfc-card', onCard)
    return () => window.removeEventListener('runly:nfc-card', onCard)
  }, [phase, submitCard])

  return {
    phase, pairing, roster, kiosk: roster?.kiosk ?? null, online: reachable && browserOnline, pending, authIssue, rejectedLog, result,
    clearResult, submitPin, submitQr, submitCard, retryPairing: startPairing, syncNow,
  }
}

function groupName(roster, person) {
  return roster?.groups?.find((g) => g.id === person.groupId)?.name ?? null
}
