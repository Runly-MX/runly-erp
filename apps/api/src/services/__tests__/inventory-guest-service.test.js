import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryGuestService } from '../inventory-guest-service.js';
import { createAttemptGuard } from '../../routes/lms/lms-invite-core.js';
import { hashGuestToken } from '../inventory-guest-core.js';
import { createFakeDb } from './inventory-guest-fake.js';

const CO = '01900000-0000-7000-8000-00000000c001';
const AREA = '01900000-0000-7000-8000-0000000000a1';
const tokenOf = (link) => link.split('/app/p/inventory/')[1];

function build({ mail = true, now = () => new Date() } = {}) {
  const db = createFakeDb({ invArea: [{ id: AREA, companyId: CO, name: 'Taller', enabled: true }], company: [{ id: CO, name: 'Acme' }] });
  const sent = [];
  const svc = createInventoryGuestService({
    prisma: db,
    sendMail: mail ? async (m) => { sent.push(m); } : null,
    buildMail: mail ? (args) => ({ subject: 's', html: 'h', text: args.inviteUrl }) : null,
    appBaseUrl: () => 'https://app.example.com',
    attemptGuard: createAttemptGuard(),
    now,
  });
  return { db, svc, sent };
}

describe('inventory guest invitations', () => {
  let t;
  beforeEach(() => { t = build(); });

  it('creates the guest, membership and a hashed invite, and emails the link', async () => {
    const res = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: ' Prov@Example.com ', name: 'Proveedor', role: 'editor' });
    assert.equal(res.sent, true);
    assert.match(res.link, /^https:\/\/app\.example\.com\/app\/p\/inventory\/[A-Za-z0-9_-]{43}$/);
    assert.equal(t.sent[0].to, 'prov@example.com');
    const invite = t.db.invGuestInvite.rows[0];
    assert.equal(invite.tokenHash, hashGuestToken(tokenOf(res.link)));
    assert.notEqual(invite.tokenHash, tokenOf(res.link));
    assert.deepEqual(t.db.invAreaMember.rows.map((m) => [m.areaId, m.role]), [[AREA, 'editor']]);
    // Inviting again reuses the guest and updates the role.
    await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'prov@example.com', role: 'viewer' });
    assert.equal(t.db.invGuest.rows.length, 1);
    assert.equal(t.db.invAreaMember.rows[0].role, 'viewer');
  });

  it('rejects manager role, bad email and areas of other companies', async () => {
    await assert.rejects(t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', role: 'manager' }), { status: 400 });
    await assert.rejects(t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'nope' }), { status: 400 });
    await assert.rejects(t.svc.inviteToArea({ companyId: 'other', areaId: AREA, email: 'a@b.co' }), { status: 404 });
  });

  it('still returns the link when mail is off, and an optional code', async () => {
    const off = build({ mail: false });
    const res = await off.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', requireCode: true });
    assert.equal(res.sent, false);
    assert.equal(res.mailError.code, 'MAIL_OFF');
    assert.match(res.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.ok(off.db.invGuestInvite.rows[0].codeHash);
  });

  it('lists guests of an area with status and removes membership', async () => {
    const { guest } = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co' });
    const [row] = await t.svc.listForArea(CO, AREA);
    assert.equal(row.kind, 'guest');
    assert.equal(row.status, 'pending');
    await t.svc.removeFromArea({ companyId: CO, areaId: AREA, guestId: guest.id });
    assert.deepEqual(await t.svc.listForArea(CO, AREA), []);
  });
});

describe('inventory guest sessions', () => {
  it('starts a session from the link, authenticates it and cuts access on revoke', async () => {
    const t = build();
    const { link, guest } = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co' });
    const session = await t.svc.startSession({ token: tokenOf(link) });
    assert.match(session.sessionToken, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(t.db.invGuestSession.rows[0].tokenHash, session.sessionToken);
    const auth = await t.svc.authenticate(`Guest ${session.sessionToken}`);
    assert.equal(auth.guest.id, guest.id);
    assert.equal(await t.svc.authenticate(`Bearer ${session.sessionToken}`), null);
    assert.equal(await t.svc.authenticate(undefined), null);
    await t.svc.revoke({ companyId: CO, guestId: guest.id });
    assert.equal(await t.svc.authenticate(`Guest ${session.sessionToken}`), null);
    await assert.rejects(t.svc.startSession({ token: tokenOf(link) }), { status: 401, code: 'INVALID_LINK' });
    assert.equal(t.db.invAreaMember.rows.length, 0);
  });

  it('rejects unknown, expired and revoked links with the same generic answer', async () => {
    let clock = new Date('2026-01-01T00:00:00Z');
    const t = build({ now: () => clock });
    const { link } = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co' });
    await assert.rejects(t.svc.startSession({ token: 'x'.repeat(43) }), { code: 'INVALID_LINK' });
    await assert.rejects(t.svc.startSession({ token: 'short' }), { code: 'INVALID_LINK' });
    const session = await t.svc.startSession({ token: tokenOf(link) });
    clock = new Date('2026-01-02T01:00:00Z'); // past the 24h session
    assert.equal(await t.svc.authenticate(`Guest ${session.sessionToken}`), null);
    clock = new Date('2026-01-20T00:00:00Z'); // past the 14d invite
    await assert.rejects(t.svc.startSession({ token: tokenOf(link) }), { code: 'INVALID_LINK' });
  });

  it('using the portal slides the session, so days of work never cut it off', async () => {
    let clock = new Date('2026-01-01T00:00:00Z');
    const t = build({ now: () => clock });
    const { link } = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co' });
    const session = await t.svc.startSession({ token: tokenOf(link) });
    for (let hour = 12; hour <= 96; hour += 12) {
      clock = new Date(Date.parse('2026-01-01T00:00:00Z') + hour * 3_600_000);
      assert.ok(await t.svc.authenticate(`Guest ${session.sessionToken}`), `still valid after ${hour}h of use`);
    }
  });

  it('refresh extends the session while the invite is valid, resend rotates links', async () => {
    let clock = new Date('2026-01-01T00:00:00Z');
    const t = build({ now: () => clock });
    const first = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co' });
    const session = await t.svc.startSession({ token: tokenOf(first.link) });
    clock = new Date('2026-01-01T10:00:00Z');
    const auth = await t.svc.authenticate(`Guest ${session.sessionToken}`);
    const { expiresAt } = await t.svc.refresh(auth);
    assert.equal(expiresAt, '2026-01-02T10:00:00.000Z');
    const second = await t.svc.resend({ companyId: CO, guestId: first.guest.id });
    assert.notEqual(second.link, first.link);
    assert.equal(await t.svc.authenticate(`Guest ${session.sessionToken}`), null, 'old invite sessions die');
    await assert.rejects(t.svc.startSession({ token: tokenOf(first.link) }), { code: 'INVALID_LINK' });
    assert.ok(await t.svc.startSession({ token: tokenOf(second.link) }));
  });

  it('requires and checks the access code, then locks after repeated failures', async () => {
    const t = build({ mail: false });
    const { link, code } = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', requireCode: true });
    const token = tokenOf(link);
    await assert.rejects(t.svc.startSession({ token }), { code: 'CODE_REQUIRED' });
    for (let i = 0; i < 5; i += 1) await assert.rejects(t.svc.startSession({ token, code: 'AAAA-AAAA' }), { code: 'INVALID_CODE' });
    await assert.rejects(t.svc.startSession({ token, code }), { status: 429, code: 'INVITE_LOCKED' });
    const ok = build({ mail: false });
    const fresh = await ok.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', requireCode: true });
    assert.ok(await ok.svc.startSession({ token: tokenOf(fresh.link), code: fresh.code.toLowerCase() }));
  });

  it('rotating the code keeps the link, ends sessions and makes the old code useless', async () => {
    const t = build({ mail: false });
    const { link, code, guest } = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', requireCode: true });
    const token = tokenOf(link);
    const session = await t.svc.startSession({ token, code });
    const rotated = await t.svc.rotateCode({ companyId: CO, guestId: guest.id });
    assert.ok(rotated.code && rotated.code !== code);
    assert.equal(rotated.guest.requiresCode, true);
    assert.equal(await t.svc.authenticate(`Guest ${session.sessionToken}`), null, 'open sessions end');
    await assert.rejects(t.svc.startSession({ token, code }), { code: 'INVALID_CODE' });
    assert.ok(await t.svc.startSession({ token, code: rotated.code }), 'same link, new code');
    const removed = await t.svc.rotateCode({ companyId: CO, guestId: guest.id, requireCode: false });
    assert.deepEqual([removed.code, removed.guest.requiresCode], [null, false]);
    assert.ok(await t.svc.startSession({ token }), 'no code needed any more');
  });

  it('resend keeps the access-code requirement unless told otherwise', async () => {
    const t = build({ mail: false });
    const { guest } = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', requireCode: true });
    assert.ok((await t.svc.resend({ companyId: CO, guestId: guest.id })).code, 'code kept');
    assert.equal((await t.svc.resend({ companyId: CO, guestId: guest.id, requireCode: false })).code, null);
    assert.equal((await t.svc.resend({ companyId: CO, guestId: guest.id })).code, null, 'stays without code');
  });
});

describe('guest capability flags', () => {
  it('invites with flags, lists them, updates them, and never keeps them on a viewer', async () => {
    const t = build({ mail: false });
    const res = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', role: 'editor', canCreateModels: true, canImport: true });
    assert.equal(res.guest.canCreateModels, true);
    assert.equal(res.guest.canImport, true);
    const listed = await t.svc.listForArea(CO, AREA);
    assert.deepEqual([listed[0].canCreateModels, listed[0].canImport], [true, true]);
    const off = await t.svc.updateMember({ companyId: CO, areaId: AREA, guestId: res.guest.id, canImport: false });
    assert.deepEqual([off.role, off.canCreateModels, off.canImport], ['editor', true, false]);
    // Demoting to viewer clears both flags; a viewer invite ignores them.
    const viewer = await t.svc.updateMember({ companyId: CO, areaId: AREA, guestId: res.guest.id, role: 'viewer' });
    assert.deepEqual([viewer.role, viewer.canCreateModels, viewer.canImport], ['viewer', false, false]);
    const v2 = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'v@b.co', role: 'viewer', canImport: true });
    assert.equal(v2.guest.canImport, false);
    assert.equal(t.db.invAreaMember.rows.find((m) => m.guestId === v2.guest.id).canImport, false);
  });

  it('flags default to false, updateMember validates role, area and membership', async () => {
    const t = build({ mail: false });
    const res = await t.svc.inviteToArea({ companyId: CO, areaId: AREA, email: 'a@b.co', role: 'editor' });
    assert.deepEqual([res.guest.canCreateModels, res.guest.canImport], [false, false]);
    await assert.rejects(t.svc.updateMember({ companyId: CO, areaId: AREA, guestId: res.guest.id, role: 'manager' }), { status: 400 });
    await assert.rejects(t.svc.updateMember({ companyId: 'other', areaId: AREA, guestId: res.guest.id }), { status: 404 });
    await assert.rejects(t.svc.updateMember({ companyId: CO, areaId: AREA, guestId: '01900000-0000-7000-8000-0000000000ff' }), { status: 404 });
  });
});
