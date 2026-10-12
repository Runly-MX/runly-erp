// Public (unauthenticated) side of runly.attendance: kiosk pairing, roster
// download, idempotent punch sync and phone-key enrollment.
import {
  AttendanceError, geofenceFlag, nextDirection, parseKioskChallenge, verifyKioskChallenge, verifyPhoneScan, openWithSecret, sealWithSecret, normalizeUid, parsePhonePayload, randomDigits, randomToken, resolvePunchTime, sha256, verifyPhonePayload,
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
      data: { pairingCode: code, pairingSecretHash: sha256(pollSecret), pairingLabel: String(label ?? '').trim().slice(0, 80) || null, pairingRequestedAt: new Date(), approvedAt: null, pairingTokenEnc: null },
    })
    return { code, pollSecret, kioskName: kiosk.name }
  }

  async function pairingStatus(linkToken, pollSecret) {
    const kiosk = await kioskByLink(linkToken)
    if (!pollSecret || !kiosk.pairingSecretHash || sha256(pollSecret) !== kiosk.pairingSecretHash) throw new AttendanceError('Solicitud de emparejamiento no válida.', 401, 'BAD_POLL_SECRET')
    if (kiosk.pairingRequestedAt && Date.now() - kiosk.pairingRequestedAt.getTime() > PAIRING_TTL_MS) return { status: 'expired' }
    // Already handed out once: the same poll secret gets the token again until the
    // kiosk confirms receipt with its first authenticated call (lost-response recovery).
    if (kiosk.deviceTokenHash && kiosk.pairingTokenEnc) {
      const again = openWithSecret(kiosk.pairingTokenEnc, pollSecret)
      return again ? { status: 'paired', deviceToken: again } : { status: 'expired' }
    }
    if (!kiosk.approvedAt) return { status: 'pending', code: kiosk.pairingCode }
    const deviceToken = randomToken(32)
    await prisma.attKiosk.update({
      where: { id: kiosk.id },
      data: { deviceTokenHash: sha256(deviceToken), pairingTokenEnc: sealWithSecret(deviceToken, pollSecret), pairedAt: new Date(), pairingCode: null, approvedAt: null, lastSeenAt: new Date() },
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
    const qrSecret = kiosk.qrSecret ?? randomToken(32)
    const settingsRow = await prisma.attSettings.findUnique({ where: { companyId } })
    await prisma.attKiosk.update({ where: { id: kiosk.id }, data: { lastSeenAt: new Date(), ...(kiosk.qrSecret ? {} : { qrSecret }), ...(kiosk.pairingTokenEnc ? { pairingTokenEnc: null, pairingSecretHash: null } : {}) } })
    const active = new Set(people.map((p) => p.id))
    // Last punch per person (24h) lets the offline kiosk alternate in/out.
    const since = new Date(Date.now() - 24 * 3_600_000)
    const recent = await prisma.attPunch.findMany({ where: { companyId, occurredAt: { gte: since }, status: { not: 'voided' } }, orderBy: { occurredAt: 'asc' }, select: { personId: true, direction: true, occurredAt: true } })
    const last = new Map(recent.map((p) => [p.personId, p]))
    return {
      serverTime: new Date().toISOString(),
      kiosk: { id: kiosk.id, name: kiosk.name, mode: kiosk.mode, requireSelfie: kiosk.requireSelfie, allowPin: kiosk.allowPin, siteId: kiosk.siteId, siteName: site?.name ?? null, geofence: site && site.latitude != null && site.radiusM ? { latitude: site.latitude, longitude: site.longitude, radiusM: site.radiusM } : null, companyName: company?.name ?? null },
      qrSecret,
      settings: { requirePhotoForQr: settingsRow?.requirePhotoForQr ?? true },
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
    const settingsRow = await prisma.attSettings.findUnique({ where: { companyId: kiosk.companyId } })
    const requirePhoto = settingsRow?.requirePhotoForQr ?? true
    const site = kiosk.siteId ? await prisma.attSite.findFirst({ where: { id: kiosk.siteId, companyId: kiosk.companyId } }) : null
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
        const outside = geofenceFlag(site, Number(punch.latitude), Number(punch.longitude))
        if (outside) flags.push(outside)
        if (requirePhoto && ['phone_qr', 'card'].includes(punch.method) && punch.selfie !== 'captured') flags.push('no_photo')
        if (previous && expected !== punch.direction && punch.direction === previous.direction) flags.push('sequence')
        if (punch.offline) flags.push('offline')
        const suspicious = flags.some((f) => ['proof_failed', 'replay', 'clock_skew', 'future_time', 'sequence', 'outside_geofence', 'no_photo'].includes(f))
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
    // One phone per person: a new enrollment replaces (revokes) the previous phone key, so a
    // lost or shared phone stops working the moment the person re-enrolls.
    await prisma.attCredential.updateMany({ where: { personId: person.id, type: 'device_key', status: 'active' }, data: { status: 'revoked' } })
    const credential = await prisma.attCredential.create({ data: { companyId: person.companyId, personId: person.id, type: 'device_key', publicKey: { kty, crv, x, y }, label: String(label ?? '').trim().slice(0, 80) || 'Teléfono', status: 'active' } })
    await prisma.attPerson.update({ where: { id: person.id }, data: { enrollCode: null, enrollExpiresAt: null } })
    return { personId: person.id, credentialId: credential.id, name: [person.firstName, person.lastName].filter(Boolean).join(' '), code: person.code }
  }

  const SELFIE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const SELFIE_MAX_BYTES = 400 * 1024

  // Evidence photo for a punch the kiosk already synced. Stored as a FileAsset
  // owned by the punch; the kiosk never learns the file location.
  async function attachSelfie(kiosk, punchId, file, { supabaseAdmin, bucket }) {
    if (!supabaseAdmin || !bucket) throw new AttendanceError('El almacenamiento no está disponible.', 503)
    const punch = await prisma.attPunch.findFirst({ where: { id: punchId, companyId: kiosk.companyId, kioskId: kiosk.id } })
    if (!punch) throw new AttendanceError('La checada no existe.', 404)
    if (punch.selfieFileId) return { fileId: punch.selfieFileId, duplicate: true }
    const ext = SELFIE_TYPES[file?.type]
    if (!ext) throw new AttendanceError('La imagen debe ser JPG, PNG o WebP.', 400)
    if (!file.size || file.size > SELFIE_MAX_BYTES) throw new AttendanceError('La imagen es demasiado grande.', 413)
    const objectKey = `modules/runly-attendance/selfies/${kiosk.companyId}/${punchId}.${ext}`
    const { error } = await supabaseAdmin.storage.from(bucket).upload(objectKey, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true })
    if (error) throw new AttendanceError('No se pudo guardar la imagen.', 502)
    const asset = await prisma.fileAsset.create({ data: { bucket, objectKey, originalName: `${punchId}.${ext}`, mimeType: file.type, sizeBytes: file.size, moduleKey: 'runly.attendance', entityType: 'AttPunch', entityId: punchId } })
    await prisma.attPunch.update({ where: { id: punchId }, data: { selfieFileId: asset.id } })
    return { fileId: asset.id }
  }

  // Punches this kiosk recorded after `since` (phone scans arrive without the kiosk
  // knowing): lets the screen greet the person and take the evidence photo.
  async function recent(kiosk, since) {
    const from = since && !Number.isNaN(new Date(since).getTime()) ? new Date(since) : new Date(Date.now() - 20_000)
    const rows = await prisma.attPunch.findMany({
      where: { companyId: kiosk.companyId, kioskId: kiosk.id, receivedAt: { gt: from }, method: 'phone_scan', status: { not: 'voided' } },
      orderBy: { receivedAt: 'asc' }, take: 10, include: { person: { select: { firstName: true, lastName: true, code: true, groupId: true } } },
    })
    return rows.map((p) => ({ id: p.id, personId: p.personId, name: [p.person.firstName, p.person.lastName].filter(Boolean).join(' '), code: p.person.code, groupId: p.person.groupId, direction: p.direction, occurredAt: p.occurredAt, receivedAt: p.receivedAt, hasSelfie: Boolean(p.selfieFileId) }))
  }

  // The person's phone scanned the kiosk's challenge QR: verify the kiosk MAC, the
  // phone's signature and replay, then record the punch as that kiosk's.
  async function phonePunch({ challenge, personId, signature, latitude, longitude }) {
    const parsed = parseKioskChallenge(challenge)
    if (!parsed || !personId || !signature) throw new AttendanceError('El código del kiosko no es válido.', 400, 'BAD_CHALLENGE')
    const kiosk = await prisma.attKiosk.findUnique({ where: { id: parsed.kioskId } })
    if (!kiosk || !kiosk.enabled || kiosk.revokedAt || !kiosk.qrSecret) throw new AttendanceError('Este kiosko no está disponible.', 404, 'KIOSK_NOT_FOUND')
    const check = verifyKioskChallenge({ challenge, secret: kiosk.qrSecret })
    if (!check.ok) throw new AttendanceError(check.reason === 'expired' ? 'El código del kiosko caducó. Escanea el que se muestra ahora.' : 'El código del kiosko no es válido.', 400, 'BAD_CHALLENGE')
    const person = await prisma.attPerson.findFirst({ where: { id: personId, companyId: kiosk.companyId, enabled: true } })
    if (!person) throw new AttendanceError('Tu llave no está registrada en esta empresa.', 403, 'UNKNOWN_PERSON')
    const keys = await prisma.attCredential.findMany({ where: { companyId: kiosk.companyId, personId, type: 'device_key', status: 'active' } })
    const key = keys.find((k) => verifyPhoneScan({ personId, challenge, signature, jwk: k.publicKey }))
    if (!key) throw new AttendanceError('No se pudo verificar tu teléfono. Vuelve a enrolarlo con tu administrador.', 403, 'BAD_SIGNATURE')
    const note = `scan:${person.id}:${check.ts}`
    if (await prisma.attPunch.findFirst({ where: { companyId: kiosk.companyId, note }, select: { id: true } })) throw new AttendanceError('Este código ya se usó. Escanea el siguiente.', 409, 'REPLAY')
    const now = new Date()
    const previous = await prisma.attPunch.findFirst({ where: { personId, status: { not: 'voided' }, occurredAt: { lte: now } }, orderBy: { occurredAt: 'desc' }, select: { direction: true, occurredAt: true, status: true } })
    const direction = nextDirection(previous, kiosk.mode, now)
    const site = kiosk.siteId ? await prisma.attSite.findFirst({ where: { id: kiosk.siteId, companyId: kiosk.companyId } }) : null
    const flags = []
    const outside = geofenceFlag(site, Number(latitude), Number(longitude))
    if (outside) flags.push(outside)
    const lat = Number.isFinite(Number(latitude)) && latitude !== null && latitude !== undefined ? Number(latitude) : null
    const lng = Number.isFinite(Number(longitude)) && longitude !== null && longitude !== undefined ? Number(longitude) : null
    const punch = await prisma.attPunch.create({
      data: { companyId: kiosk.companyId, personId, siteId: kiosk.siteId ?? null, kioskId: kiosk.id, direction, occurredAt: now, deviceTime: now, method: 'phone_scan', offline: false, latitude: lat, longitude: lng, flags, status: flags.length ? 'flagged' : 'valid', note },
    })
    await prisma.attCredential.update({ where: { id: key.id }, data: { lastUsedAt: now } }).catch(() => {})
    return { id: punch.id, direction, occurredAt: now, name: [person.firstName, person.lastName].filter(Boolean).join(' '), kioskName: kiosk.name }
  }

  return { recent, phonePunch, attachSelfie, kioskByLink, authenticate, requestPairing, pairingStatus, roster, sync, enrollPhone }
}
