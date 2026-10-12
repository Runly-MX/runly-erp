// Public (unauthenticated) side of runly.attendance: kiosk pairing, roster
// download, idempotent punch sync and phone-key enrollment.
import {
  AttendanceError, nextDirection, normalizeUid, parsePhonePayload, randomDigits, randomToken, resolvePunchTime, sha256, verifyPhonePayload,
} from './attendance-core.js'

const METHODS = ['pin', 'code', 'card', 'phone_qr']
const MAX_BATCH = 200
const PAIRING_TTL_MS = 30 * 60_000

export function createAttendanceKioskService({ prisma }) {
  async function kioskByLink(linkToken) {
    const kiosk = linkToken ? await prisma.attKiosk.findUnique({ where: { linkToken: String(linkToken) } }) : null
    if (!kiosk || !kiosk.enabled) throw new AttendanceError('Este kiosko no está disponible.', 404, 'KIOSK_NOT_FOUND')
    return kiosk
  }

  // Link + device token. A shared link alone never grants access to the roster.
  async function authenticate(linkToken, deviceToken) {
    const kiosk = await kioskByLink(linkToken)
    if (kiosk.revokedAt) throw new AttendanceError('Este kiosko fue revocado.', 403, 'KIOSK_REVOKED')
    if (!deviceToken || !kiosk.deviceTokenHash || sha256(deviceToken) !== kiosk.deviceTokenHash) throw new AttendanceError('Dispositivo no autorizado.', 401, 'KIOSK_UNAUTHORIZED')
    return kiosk
  }

  async function requestPairing(linkToken, label) {
    const kiosk = await kioskByLink(linkToken)
    if (kiosk.revokedAt) throw new AttendanceError('Este kiosko fue revocado.', 403, 'KIOSK_REVOKED')
    if (kiosk.deviceTokenHash) throw new AttendanceError('Este kiosko ya está emparejado con otro dispositivo. Pide a un administrador que lo restablezca.', 409, 'ALREADY_PAIRED')
    const code = randomDigits(6)
    const pollSecret = randomToken(24)
    await prisma.attKiosk.update({
      where: { id: kiosk.id },
      data: { pairingCode: code, pairingSecretHash: sha256(pollSecret), pairingLabel: String(label ?? '').trim().slice(0, 80) || null, pairingRequestedAt: new Date(), approvedAt: null },
    })
    return { code, pollSecret, kioskName: kiosk.name }
  }

  async function pairingStatus(linkToken, pollSecret) {
    const kiosk = await kioskByLink(linkToken)
    if (!pollSecret || !kiosk.pairingSecretHash || sha256(pollSecret) !== kiosk.pairingSecretHash) throw new AttendanceError('Solicitud de emparejamiento no válida.', 401, 'BAD_POLL_SECRET')
    if (kiosk.pairingRequestedAt && Date.now() - kiosk.pairingRequestedAt.getTime() > PAIRING_TTL_MS) return { status: 'expired' }
    if (!kiosk.approvedAt) return { status: 'pending', code: kiosk.pairingCode }
    const deviceToken = randomToken(32)
    await prisma.attKiosk.update({
      where: { id: kiosk.id },
      data: { deviceTokenHash: sha256(deviceToken), pairedAt: new Date(), pairingCode: null, pairingSecretHash: null, approvedAt: null, lastSeenAt: new Date() },
    })
    return { status: 'paired', deviceToken }
  }

  async function roster(kiosk) {
    const { companyId } = kiosk
    const [people, credentials, groups, categories, site, company] = await Promise.all([
      prisma.attPerson.findMany({ where: { companyId, enabled: true } }),
      prisma.attCredential.findMany({ where: { companyId, status: 'active' } }),
      prisma.attGroup.findMany({ where: { companyId }, select: { id: true, name: true } }),
      prisma.attCategory.findMany({ where: { companyId }, select: { id: true, name: true } }),
      kiosk.siteId ? prisma.attSite.findFirst({ where: { id: kiosk.siteId, companyId } }) : null,
      prisma.company?.findUnique ? prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }).catch(() => null) : null,
    ])
    await prisma.attKiosk.update({ where: { id: kiosk.id }, data: { lastSeenAt: new Date() } })
    const active = new Set(people.map((p) => p.id))
    // Last punch per person (24h) lets the offline kiosk alternate in/out.
    const since = new Date(Date.now() - 24 * 3_600_000)
    const recent = await prisma.attPunch.findMany({ where: { companyId, occurredAt: { gte: since }, status: { not: 'voided' } }, orderBy: { occurredAt: 'asc' }, select: { personId: true, direction: true, occurredAt: true } })
    const last = new Map(recent.map((p) => [p.personId, p]))
    return {
      serverTime: new Date().toISOString(),
      kiosk: { id: kiosk.id, name: kiosk.name, mode: kiosk.mode, requireSelfie: kiosk.requireSelfie, allowPin: kiosk.allowPin, siteId: kiosk.siteId, siteName: site?.name ?? null, companyName: company?.name ?? null },
      groups, categories,
      people: people.map((p) => ({
        id: p.id, code: p.code, firstName: p.firstName, lastName: p.lastName, kind: p.kind, groupId: p.groupId, categoryId: p.categoryId,
        pinHash: kiosk.allowPin ? p.pinHash : null,
        last: last.has(p.id) ? { direction: last.get(p.id).direction, occurredAt: last.get(p.id).occurredAt } : null,
      })),
      cards: credentials.filter((c) => c.type === 'card' && active.has(c.personId)).map((c) => ({ uid: c.uid, personId: c.personId })),
      keys: credentials.filter((c) => c.type === 'device_key' && active.has(c.personId)).map((c) => ({ id: c.id, personId: c.personId, jwk: c.publicKey })),
    }
  }

  // Validate the proof the kiosk collected (card uid / signed QR) against current
  // credentials. A failed proof is kept and flagged, never silently dropped.
  async function checkProof(companyId, personId, punch) {
    if (punch.method === 'card') {
      const uid = normalizeUid(punch.proof)
      const card = uid ? await prisma.attCredential.findFirst({ where: { companyId, personId, type: 'card', uid, status: 'active' } }) : null
      if (card) await prisma.attCredential.update({ where: { id: card.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
      return card ? { flags: [], note: null } : { flags: ['proof_failed'], note: null }
    }
    if (punch.method === 'phone_qr') {
      const parsed = parsePhonePayload(punch.proof)
      if (!parsed || parsed.personId !== personId) return { flags: ['proof_failed'], note: null }
      const keys = await prisma.attCredential.findMany({ where: { companyId, personId, type: 'device_key', status: 'active' } })
      // Offline punches are verified against the time they were scanned, not now.
      const when = punch.deviceTime ? new Date(punch.deviceTime).getTime() : Date.now()
      const verified = keys.find((k) => verifyPhonePayload({ payload: parsed, jwk: k.publicKey, now: when, windowMs: 5 * 60_000 }).ok)
      if (!verified) return { flags: ['proof_failed'], note: null }
      const replay = await prisma.attPunch.findFirst({ where: { companyId, personId, note: `qr:${parsed.ts}` }, select: { id: true } })
      await prisma.attCredential.update({ where: { id: verified.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
      return replay ? { flags: ['replay'], note: `qr:${parsed.ts}` } : { flags: [], note: `qr:${parsed.ts}` }
    }
    return { flags: [], note: null }
  }

  async function sync(kiosk, body = {}) {
    const incoming = Array.isArray(body.punches) ? body.punches.slice(0, MAX_BATCH) : []
    const serverNow = new Date()
    const deviceNow = body.deviceNow ? new Date(body.deviceNow) : null
    const offsetMs = deviceNow && !Number.isNaN(deviceNow.getTime()) ? serverNow.getTime() - deviceNow.getTime() : 0
    const ids = incoming.map((p) => p?.id).filter((id) => typeof id === 'string')
    const existing = new Set((await prisma.attPunch.findMany({ where: { id: { in: ids }, companyId: kiosk.companyId }, select: { id: true } })).map((p) => p.id))
    const accepted = []
    const rejected = []
    // Oldest first so in/out sequence checks see earlier punches of the same batch.
    const ordered = [...incoming].sort((a, b) => new Date(a?.deviceTime ?? 0) - new Date(b?.deviceTime ?? 0))
    for (const punch of ordered) {
      try {
        if (!punch || !/^[0-9a-f-]{36}$/i.test(punch.id ?? '')) { rejected.push({ id: punch?.id ?? null, reason: 'bad_id' }); continue }
        if (existing.has(punch.id)) { accepted.push(punch.id); continue }
        if (!['in', 'out'].includes(punch.direction) || !METHODS.includes(punch.method)) { rejected.push({ id: punch.id, reason: 'bad_punch' }); continue }
        const person = await prisma.attPerson.findFirst({ where: { id: punch.personId, companyId: kiosk.companyId } })
        if (!person || !person.enabled) { rejected.push({ id: punch.id, reason: 'unknown_person' }); continue }
        const time = resolvePunchTime({ deviceTime: punch.deviceTime, offsetMs, serverNow })
        const proof = await checkProof(kiosk.companyId, person.id, punch)
        const previous = await prisma.attPunch.findFirst({ where: { personId: person.id, status: { not: 'voided' }, occurredAt: { lte: time.occurredAt } }, orderBy: { occurredAt: 'desc' }, select: { direction: true, occurredAt: true, status: true } })
        const expected = nextDirection(previous, 'both', time.occurredAt)
        const flags = [...time.flags, ...proof.flags]
        if (previous && expected !== punch.direction && punch.direction === previous.direction) flags.push('sequence')
        if (punch.offline) flags.push('offline')
        const suspicious = flags.some((f) => ['proof_failed', 'replay', 'clock_skew', 'future_time', 'sequence'].includes(f))
        await prisma.attPunch.create({
          data: {
            id: punch.id, companyId: kiosk.companyId, personId: person.id, siteId: kiosk.siteId ?? null, kioskId: kiosk.id, direction: punch.direction,
            occurredAt: time.occurredAt, deviceTime: punch.deviceTime ? new Date(punch.deviceTime) : null, method: punch.method, offline: Boolean(punch.offline),
            clockSkewMs: time.skewMs || null, latitude: Number.isFinite(punch.latitude) ? punch.latitude : null, longitude: Number.isFinite(punch.longitude) ? punch.longitude : null,
            flags, status: suspicious ? 'flagged' : 'valid', note: proof.note,
          },
        })
        accepted.push(punch.id)
      } catch (error) {
        if (error?.code === 'P2002') accepted.push(punch?.id)
        else rejected.push({ id: punch?.id ?? null, reason: 'error' })
      }
    }
    await prisma.attKiosk.update({ where: { id: kiosk.id }, data: { lastSeenAt: serverNow } })
    return { accepted, rejected, serverTime: serverNow.toISOString(), offsetMs }
  }

  // The invite code is issued by an admin (that is the approval); the person
  // proves who they are with it plus their own employee code.
  async function enrollPhone({ enrollCode, code, publicKey, label }) {
    const invite = String(enrollCode ?? '').trim().toUpperCase()
    if (!invite || !publicKey || publicKey.kty !== 'EC' || publicKey.crv !== 'P-256') throw new AttendanceError('Datos de enrolamiento incompletos.', 400)
    const person = await prisma.attPerson.findFirst({ where: { enrollCode: invite, enabled: true } })
    const valid = person && person.enrollExpiresAt && person.enrollExpiresAt > new Date() && String(code ?? '').trim().toLowerCase() === person.code.toLowerCase()
    if (!valid) throw new AttendanceError('El código de invitación o el código de empleado no coinciden, o la invitación venció.', 403, 'BAD_ENROLL')
    const { x, y, kty, crv } = publicKey
    const credential = await prisma.attCredential.create({ data: { companyId: person.companyId, personId: person.id, type: 'device_key', publicKey: { kty, crv, x, y }, label: String(label ?? '').trim().slice(0, 80) || 'Teléfono', status: 'active' } })
    await prisma.attPerson.update({ where: { id: person.id }, data: { enrollCode: null, enrollExpiresAt: null } })
    return { personId: person.id, credentialId: credential.id, name: [person.firstName, person.lastName].filter(Boolean).join(' '), code: person.code }
  }

  return { kioskByLink, authenticate, requestPairing, pairingStatus, roster, sync, enrollPhone }
}
