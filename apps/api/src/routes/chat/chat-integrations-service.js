// apps/api/src/routes/chat/chat-integrations-service.js
//
// Integrations that post into one chat channel: an incoming webhook per channel
// (secret URL), the service contract used by automations and Builder modules, and
// the management used by channel admins. Spec
// docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 1.
//
// Who speaks: messages are stored with sender_type = 'system', no user, and
// metadata.integration = { id|kind, name, icon }. Integrations are never user
// profiles, so no user list or search ever shows them.
import crypto from "node:crypto";
import { ChatServiceError } from "./chat-service-error.js";

export const MAX_TEXT = 4000;
export const MAX_TITLE = 200;
export const MAX_FIELDS = 10;
export const MAX_NAME = 80;
export const RATE_PER_MINUTE = 30;
export const MAX_BODY_BYTES = 32 * 1024;
const MAX_PER_CHANNEL = 20;

export const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
const newToken = () => crypto.randomBytes(24).toString("base64url");

const clip = (value, max) => String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);

// A link is only kept when it is an http(s) address or a path inside Runly.
export function safeLink(value) {
  const text = clip(value, 500);
  if (!text) return "";
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export const MAX_BUTTONS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Buttons of an interactive message: up to 3 link buttons ({ label, url }), or the Aprobar /
// Rechazar pair of an approval (`approvalId`). Pure; invalid buttons are dropped. Spec
// docs/superpowers/specs/2026-10-26-interactive-messages-design.md.
export function buildActions(input, { allowCallbacks = false } = {}) {
  const actions = [];
  if (input?.approvalId && UUID.test(String(input.approvalId))) {
    actions.push({ id: "approve", kind: "approval", approvalId: String(input.approvalId), decision: "approve", label: "Aprobar", style: "primary" });
    actions.push({ id: "reject", kind: "approval", approvalId: String(input.approvalId), decision: "reject", label: "Rechazar", style: "danger" });
    return actions;
  }
  // A button with `url` opens a link; one with `value` (only for integrations that have a
  // reply address) sends that value back to the integration when pressed.
  const valid = (Array.isArray(input?.buttons) ? input.buttons : [])
    .map((button) => ({ label: clip(button?.label, 30), url: safeLink(button?.url), value: allowCallbacks ? clip(button?.value, 100) : "", style: button?.style === "primary" || button?.style === "danger" ? button.style : "default" }))
    .filter((button) => button.label && (button.url || button.value))
    .slice(0, MAX_BUTTONS);
  valid.forEach((button, index) => actions.push(button.url
    ? { id: `link${index}`, kind: "link", label: button.label, url: button.url, style: "default" }
    : { id: `cb${index}`, kind: "callback", label: button.label, value: button.value, style: button.style }));
  return actions;
}

// { text, title?, link?, fields?: [{ label, value }] } -> the plain-text body of the message.
// Pure; exported for tests. Throws ChatServiceError (400) when there is nothing to say.
export function buildIntegrationBody(input) {
  const title = clip(input?.title, MAX_TITLE);
  const text = clip(input?.text, MAX_TEXT);
  const link = safeLink(input?.link);
  const fields = (Array.isArray(input?.fields) ? input.fields : [])
    .slice(0, MAX_FIELDS)
    .map((field) => ({ label: clip(field?.label, 60), value: clip(field?.value, 300) }))
    .filter((field) => field.label && field.value);
  const lines = [];
  if (title) lines.push(`*${title.replace(/\*/g, "")}*`);
  if (text) lines.push(text);
  for (const field of fields) lines.push(`${field.label}: ${field.value}`);
  if (link) lines.push(link);
  const body = lines.join("\n");
  if (!body) throw new ChatServiceError("El mensaje necesita texto, título o campos.", 400);
  return body.slice(0, MAX_TEXT + 1500);
}

export function createChatIntegrationsService({ prisma, broadcaster = null, now = () => new Date() }) {
  const hits = new Map();

  // Per-integration limit so a leaked URL cannot flood a channel.
  function limited(key) {
    const cutoff = now().getTime() - 60_000;
    const recent = (hits.get(key) ?? []).filter((time) => time > cutoff);
    recent.push(now().getTime());
    hits.set(key, recent);
    if (hits.size > 5000) for (const [id, times] of hits) if (!times.some((time) => time > cutoff)) hits.delete(id);
    return recent.length > RATE_PER_MINUTE;
  }

  async function postMessage({ conversationId, body, integration, actions = [] }) {
    const metadata = actions.length ? { integration, actions } : { integration };
    const rows = await prisma.$queryRaw`
      INSERT INTO chat_messages (conversation_id, sender_type, body, message_type, metadata)
      VALUES (${conversationId}::uuid, 'system', ${body}, 'text', ${JSON.stringify(metadata)}::jsonb)
      RETURNING id, created_at
    `;
    const messageId = rows?.[0]?.id;
    if (!messageId) throw new ChatServiceError("No se pudo publicar el mensaje.", 500);
    await prisma.$executeRaw`
      UPDATE chat_conversations
      SET last_message_id = ${messageId}::uuid, last_message_at = ${rows[0].created_at}, updated_at = NOW()
      WHERE id = ${conversationId}::uuid
    `;
    await prisma.$executeRaw`UPDATE chat_conversation_members SET hidden_at = NULL WHERE conversation_id = ${conversationId}::uuid AND hidden_at IS NOT NULL`;
    const members = await prisma.$queryRaw`
      SELECT user_id FROM chat_conversation_members
      WHERE conversation_id = ${conversationId}::uuid AND left_at IS NULL AND user_id IS NOT NULL
    `;
    const memberIds = members.map((row) => row.user_id.toString());
    if (memberIds.length) {
      await broadcaster?.broadcastToUsers?.(memberIds, "chat.message.new", {
        conversationId, messageId, senderId: null, senderName: integration.name, threadRootId: null, replyToMessageId: null,
      });
    }
    return { id: messageId, conversationId };
  }

  // Public webhook: the token is the credential. Unknown, disabled or archived -> 404 without detail.
  async function postFromToken(token, input) {
    const [row] = await prisma.$queryRaw`
      SELECT i.id, i.name, i.icon, i.conversation_id, i.callback_url
      FROM chat_integrations i
      JOIN chat_conversations c ON c.id = i.conversation_id
      WHERE i.token_hash = ${hashToken(token)} AND i.enabled = TRUE
        AND c.deleted_at IS NULL AND c.status <> 'archived'
    `;
    if (!row) throw new ChatServiceError("Integración no encontrada.", 404);
    if (limited(row.id)) throw new ChatServiceError("Demasiados mensajes: espera un minuto.", 429);
    const body = buildIntegrationBody(input);
    // Webhooks may only add link buttons (a decision button needs the platform's own approval id).
    const posted = await postMessage({ conversationId: row.conversation_id, body, integration: { id: row.id, name: row.name, icon: row.icon }, actions: buildActions({ buttons: input.buttons }, { allowCallbacks: Boolean(row.callback_url) }) });
    await prisma.$executeRaw`UPDATE chat_integrations SET last_used_at = NOW(), message_count = message_count + 1 WHERE id = ${row.id}::uuid`;
    return posted;
  }

  // The channel a service call writes to: a company channel by id or exact name.
  async function resolveChannel(companyId, channel) {
    const text = clip(channel, 120);
    if (!text) throw new ChatServiceError("Indica el canal.", 400);
    const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
    const rows = isId
      ? await prisma.$queryRaw`SELECT id, title FROM chat_conversations WHERE id = ${text}::uuid AND company_id = ${companyId}::uuid AND type = 'channel' AND deleted_at IS NULL AND status <> 'archived'`
      : await prisma.$queryRaw`SELECT id, title FROM chat_conversations WHERE company_id = ${companyId}::uuid AND type = 'channel' AND deleted_at IS NULL AND status <> 'archived' AND lower(title) = lower(${text}) LIMIT 2`;
    if (!rows.length) throw new ChatServiceError(`No encontré el canal "${text}".`, 404);
    if (rows.length > 1) throw new ChatServiceError(`Hay varios canales llamados "${text}": usa su id.`, 409);
    return rows[0];
  }

  // Service contract / automation action: posts as a labelled source (an automation or a module).
  async function postFromService({ companyId, channel, source, input }) {
    const target = await resolveChannel(companyId, channel);
    if (limited(`svc:${companyId}:${target.id}`)) throw new ChatServiceError("Demasiados mensajes al canal: espera un minuto.", 429);
    const body = buildIntegrationBody(input);
    const posted = await postMessage({ conversationId: target.id, body, integration: { kind: source.kind, name: clip(source.name, MAX_NAME) || "Integración", icon: source.icon ?? null }, actions: buildActions(input) });
    return { ...posted, channel: target.title };
  }

  // An approval request as a card with Aprobar / Rechazar in a company channel.
  async function postApproval({ companyId, channel, approvalId, message }) {
    return postFromService({ companyId, channel, source: { kind: "automation", name: "Aprobaciones" }, input: { title: "Aprobación pendiente", text: message, approvalId } });
  }

  async function list(conversationId) {
    return prisma.$queryRaw`
      SELECT id, name, icon, token_hint AS "tokenHint", enabled, callback_url AS "callbackUrl", last_used_at AS "lastUsedAt", message_count AS "messageCount", created_at AS "createdAt"
      FROM chat_integrations WHERE conversation_id = ${conversationId}::uuid ORDER BY created_at DESC
    `;
  }

  async function create({ companyId, conversationId, actorId, name, icon }) {
    const clean = clip(name, MAX_NAME);
    if (!clean) throw new ChatServiceError("Escribe un nombre para la integración.", 400);
    const [{ count }] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM chat_integrations WHERE conversation_id = ${conversationId}::uuid`;
    if (count >= MAX_PER_CHANNEL) throw new ChatServiceError(`Un canal admite hasta ${MAX_PER_CHANNEL} integraciones.`, 400);
    const token = newToken();
    const [row] = await prisma.$queryRaw`
      INSERT INTO chat_integrations (company_id, conversation_id, name, icon, token_hash, token_hint, created_by)
      VALUES (${companyId}::uuid, ${conversationId}::uuid, ${clean}, ${clip(icon, 60) || null}, ${hashToken(token)}, ${token.slice(-4)}, ${actorId}::uuid)
      RETURNING id, name, icon, token_hint AS "tokenHint", enabled, created_at AS "createdAt"
    `;
    // The token is returned this once: only its hash is stored.
    return { ...row, token };
  }

  async function rotate({ conversationId, integrationId }) {
    const token = newToken();
    const rows = await prisma.$queryRaw`
      UPDATE chat_integrations SET token_hash = ${hashToken(token)}, token_hint = ${token.slice(-4)}
      WHERE id = ${integrationId}::uuid AND conversation_id = ${conversationId}::uuid
      RETURNING id, name, icon, token_hint AS "tokenHint", enabled
    `;
    if (!rows.length) throw new ChatServiceError("Integración no encontrada.", 404);
    return { ...rows[0], token };
  }

  // https only, no credentials or port; the host must also be an allowed destination (checked when a button is pressed).
  function parseCallbackUrl(value) {
    const text = clip(value, 500);
    if (!text) return null;
    let url;
    try { url = new URL(text); } catch { throw new ChatServiceError("La dirección de respuesta no es válida.", 400); }
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new ChatServiceError("La dirección de respuesta debe ser https, sin usuario, contraseña ni puerto.", 400);
    return url.toString();
  }

  async function update({ conversationId, integrationId, name, icon, enabled, callbackUrl }) {
    const current = (await prisma.$queryRaw`SELECT name, icon, enabled, callback_url FROM chat_integrations WHERE id = ${integrationId}::uuid AND conversation_id = ${conversationId}::uuid`)[0];
    if (!current) throw new ChatServiceError("Integración no encontrada.", 404);
    const nextName = name === undefined ? current.name : clip(name, MAX_NAME);
    if (!nextName) throw new ChatServiceError("Escribe un nombre para la integración.", 400);
    const nextIcon = icon === undefined ? current.icon : clip(icon, 60) || null;
    const nextEnabled = enabled === undefined ? current.enabled : enabled === true;
    const nextCallback = callbackUrl === undefined ? current.callback_url : parseCallbackUrl(callbackUrl);
    const [row] = await prisma.$queryRaw`
      UPDATE chat_integrations SET name = ${nextName}, icon = ${nextIcon}, enabled = ${nextEnabled}, callback_url = ${nextCallback}
      WHERE id = ${integrationId}::uuid RETURNING id, name, icon, token_hint AS "tokenHint", enabled, callback_url AS "callbackUrl"
    `;
    return row;
  }

  async function remove({ conversationId, integrationId }) {
    const rows = await prisma.$queryRaw`DELETE FROM chat_integrations WHERE id = ${integrationId}::uuid AND conversation_id = ${conversationId}::uuid RETURNING id`;
    if (!rows.length) throw new ChatServiceError("Integración no encontrada.", 404);
    return { id: integrationId };
  }

  return { postFromToken, postFromService, postApproval, resolveChannel, list, create, rotate, update, remove };
}
