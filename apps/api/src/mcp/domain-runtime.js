import { accessFor, liveGrant } from './access.js';
import { createMcpState, wire, digest, transactionClient } from './state.js';
import { insist } from './config.js';
import { parameterSchema } from './contracts.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const fingerprint = value => digest(JSON.stringify(canonical(wire(value))));

// Sensitive proposals need an extra explicit confirmation in the web approval.
// Each write-capable adapter declares it (boolean or per-operation function).
// A decision is final. Repeating the same decision is a no-op (true); changing
// it, or deciding an executed proposal differently, is refused.
export function decided(p, approved) {
  if (!p.approved && !p.rejected && !p.result) return false;
  const same = approved ? p.approved && !p.rejected : p.rejected;
  insist(same, 'already_decided', p.result ? 'Esta propuesta ya se ejecutó.' : 'Esta propuesta ya tiene una decisión.', 409);
  return true;
}

export const isSensitive =(adapter, definition, input) => typeof adapter.sensitive === 'function' ? Boolean(adapter.sensitive(definition, input)) : adapter.sensitive === true;

export function createDomainRuntime({ prisma, config, registry }) {
  async function context(auth, companyId, moduleKey, permission, scope, db = prisma) {
    const grant = await liveGrant(auth, db, prisma);
    insist(grant && !grant.payload.revoked && grant.payload.resource === config.resource && grant.payload.authUserId === auth.authUserId, 'invalid_token', 'Conexión revocada.', 401);
    insist(grant.payload.companyIds.includes(companyId), 'company_not_granted', 'Empresa no autorizada.', 403);
    insist((auth.scopes ?? grant.payload.scopes).includes(scope) && grant.payload.scopes.includes(scope), 'insufficient_scope', 'Se requiere consentimiento para este dominio.', 403);
    const access = accessFor(auth, db, prisma), actx = await access.company(auth.authUserId, companyId, permission);
    await access.module(actx, moduleKey);
    return { ...actx, actorProfile: actx.profile, mcpScopes: grant.payload.scopes.filter(scope => (auth.scopes ?? grant.payload.scopes).includes(scope)) };
  }
  function operation(adapter, key, write) {
    const definition = (write ? adapter.actions : adapter.queries).find(item => (item.key ?? item.name) === key);
    insist(definition, 'not_found', 'Operación no disponible.', 404);
    return definition;
  }
  async function prepareDefinition(adapter, definition, input, actx) {
    insist(!definition.readPermission || actx.can(definition.readPermission), 'permission_denied', 'Se requiere permiso de lectura para revisar el recurso y sus cambios.', 403);
    input = (definition.inputSchema ?? parameterSchema(definition.parameters)).parse(input);
    if (adapter.guard) await adapter.guard(definition, input, actx);
    const prepared = await definition.prepare(input, actx);
    insist(prepared && !prepared.error, 'invalid_proposal', 'Datos o relaciones inválidos. Consulta los recursos accesibles y revisa la propuesta.');
    const revision = adapter.revision ? await adapter.revision(definition, prepared, actx) : null;
    return wire({ ...prepared, revision });
  }
  async function run(domain, mode, args, auth) {
    const moduleKey = `runly.${domain}`, scope = `${domain}:${mode === 'query' ? 'read' : 'write'}`;
    if (mode === 'commit') return commit(moduleKey, scope, args, auth);
    const adapter = registry.create(moduleKey, prisma), key = args.request.operation;
    const definition = operation(adapter, key, mode !== 'query');
    const actx = await context(auth, args.companyId, moduleKey, definition.permission, scope);
    if (mode === 'query') {
      if (adapter.guard) await adapter.guard(definition, args.request.input, actx);
      const result = await definition.run(args.request.input, actx);
      insist(!result?.error, 'invalid_request', 'Recurso no disponible o parámetros inválidos. Consulta los recursos autorizados.');
      return { operation: key, result: wire(result) };
    }
    const prepared = await prepareDefinition(adapter, definition, args.request.input, actx);
    const hash = fingerprint(prepared);
    // Retried prepare calls for the same immutable proposal share one commit.
    const id = Buffer.from(fingerprint({ grantId: auth.grantId, companyId: args.companyId, moduleKey, key, input: prepared.input, hash }), 'hex').toString('base64url');
    const payload = { version: 2, authUserId: auth.authUserId, grantId: auth.grantId, companyId: args.companyId, moduleKey, operation: key, scope,
      input: args.request.input, prepared, fingerprint: hash,
      sensitive: isSensitive(adapter, definition, args.request.input), approved: false, rejected: false };
    const store = createMcpState(prisma), existing = await store.get('proposal', id);
    if (!existing) {
      await prisma.mcpState.deleteMany({ where: { kind: 'proposal', key: digest(id), expiresAt: { lte: new Date() } } });
      try { await store.put('proposal', id, payload, 600); }
      catch (error) { if (error.code !== 'P2002') throw error; }
    }
    return { proposalId: id, status: 'approval_required', moduleKey, operation: key, preview: prepared.preview,
      proposed: { moduleKey, companyId: args.companyId, operation: key, input: payload.input, resolved: prepared.input, before: prepared.revision, effects: adapter.effects ?? ['Modificar datos internos; generar auditoría.'] },
      expiresIn: 600, approvalUrl: `${config.web}/app/mcp?proposal=${id}` };
  }
  async function proposalContext(p, db = prisma) {
    const adapter = registry.create(p.moduleKey, db), definition = operation(adapter, p.operation, true);
    const actx = await context(p, p.companyId, p.moduleKey, definition.permission, p.scope, db);
    insist(!definition.readPermission || actx.can(definition.readPermission), 'permission_denied', 'No puedes revisar el recurso.', 403);
    return { adapter, definition, actx };
  }
  // The assistant's input is fixed, but resolved data (related names, current
  // values) can change before the person reviews it, e.g. another proposal of
  // the same batch updated the supervisor. Until a decision exists, re-resolve
  // the same input and show/store the current version, so the person approves
  // exactly what is displayed. After approval or rejection a change stays stale.
  async function proposalInfo(authUserId, id) {
    let row = await createMcpState(prisma).get('proposal', id);
    insist(row?.payload.authUserId === authUserId, 'not_found', 'Propuesta no disponible.', 404);
    const { adapter, definition, actx } = await proposalContext(row.payload);
    let refreshed = false;
    if (!row.payload.result) {
      const fresh = await prepareDefinition(adapter, definition, row.payload.input, actx), hash = fingerprint(fresh);
      if (hash !== row.payload.fingerprint) {
        row = await prisma.$transaction(async db => {
          const store = createMcpState(db), locked = await store.lock('proposal', id), current = locked.payload;
          insist(!current.approved && !current.rejected && !current.result, 'proposal_stale', 'La propuesta cambió después de tu decisión. Prepárala de nuevo.', 409);
          return { ...locked, ...(await store.save(locked, { ...current, prepared: fresh, fingerprint: hash })) };
        });
        refreshed = true;
      }
    }
    const p = row.payload;
    return { proposalId: id, companyId: p.companyId, moduleKey: p.moduleKey, action: p.operation, preview: p.prepared.preview, refreshed,
      proposed: { operation: p.operation, input: p.input, resolved: p.prepared.input, before: p.prepared.revision, effects: adapter.effects ?? [] }, sensitive: p.sensitive, approved: p.approved, rejected: p.rejected, completed: Boolean(p.result), expiresAt: row.expiresAt };
  }
  async function approve(authUserId, id, approved, acknowledgeSensitive = false) {
    await prisma.$transaction(async db => {
      const store = createMcpState(db), row = await store.lock('proposal', id), p = row.payload;
      insist(p.authUserId === authUserId, 'permission_denied', 'Propuesta no disponible.', 403);
      if (decided(p, approved)) return;
      insist(!approved || !p.sensitive || acknowledgeSensitive, 'confirmation_required', 'Confirma explícitamente los cambios sensibles de la propuesta.', 403);
      const { adapter, definition, actx } = await proposalContext(p, db);
      const fresh = await prepareDefinition(adapter, definition, p.input, actx);
      insist(fingerprint(fresh) === p.fingerprint, 'proposal_stale', 'La propuesta cambió. Prepárala de nuevo.', 409);
      await store.save(row, { ...p, approved, rejected: !approved });
    });
    return { approved };
  }
  async function commit(moduleKey, scope, args, auth) {
    // Retry only transactions PostgreSQL rolled back for serialization. All
    // exposed adapters write DB data/outbox jobs; they make no direct external
    // calls. Queued notifications and their recipients are disclosed for approval.
    for (let attempt = 0; ; attempt++) try {
      return await prisma.$transaction(async tx => {
      const db = transactionClient(tx), store = createMcpState(db);
      await store.lock('grant', auth.grantId);
      await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mcp:${moduleKey}:${args.companyId}`}, 0))::text AS locked`;
      const row = await store.lock('proposal', args.proposalId), p = row.payload;
      insist(p.version === 2 && p.moduleKey === moduleKey && p.scope === scope && p.grantId === auth.grantId && p.authUserId === auth.authUserId && p.companyId === args.companyId, 'proposal_mismatch', 'Propuesta no disponible.', 403);
      const { adapter, definition, actx } = await proposalContext({ ...p, scopes: auth.scopes }, db);
      if (p.result) return p.result;
      insist(p.approved && !p.rejected, 'approval_required', 'Aprueba la propuesta en Runly antes de ejecutarla.', 403);
      const fresh = await prepareDefinition(adapter, definition, p.input, actx);
      insist(fingerprint(fresh) === p.fingerprint, 'proposal_stale', 'El recurso o sus relaciones cambiaron. Prepara otra propuesta.', 409);
      const result = { operation: p.operation, result: wire(await definition.execute(fresh.input, actx)) };
      await db.auditLog.create({ data: { companyId: p.companyId, actorId: actx.actorProfileId, moduleKey, action: `mcp.${p.operation}`, metadata: { proposalHash: digest(args.proposalId), clientId: auth.clientId }, after: result } });
      await store.save(row, { ...p, result });
      return result;
      }, { timeout: 30000, isolationLevel: 'Serializable' });
    } catch (error) {
      const serialized = error.code === 'P2034' || error.code === 'P2010' && (error.meta?.code === '40001' || error.meta?.driverAdapterError?.cause?.originalCode === '40001');
      if (serialized && attempt < 2) continue;
      insist(!serialized, 'resource_conflict', 'Hubo cambios concurrentes. Reintenta el mismo commit.', 409);
      throw error;
    }
  }
  return { run, proposalInfo, approve };
}
