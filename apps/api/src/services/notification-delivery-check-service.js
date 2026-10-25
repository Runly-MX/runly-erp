// "Probar entrega": sends a real test through one channel (email, web push, phone push)
// and explains in plain Spanish why it did not arrive; plus the delivery health panel
// for administrators. Spec docs/superpowers/specs/2026-10-26-slack-parity-design.md,
// section 4. Never returns secrets, tokens or full endpoints.
import { createCompanyMailer } from "./smtp-service.js";
import { createWebPushService } from "./web-push-service.js";
import { createFcmService } from "./fcm-service.js";
import { renderRunlyEmailLayout } from "./email-templates.js";

export const CHANNELS = ["email", "web_push", "fcm"];
export const CHANNEL_LABELS = { email: "Correo", web_push: "Notificaciones del navegador", fcm: "Notificaciones del teléfono", in_app: "Dentro de Runly" };

export class DeliveryCheckError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "DeliveryCheckError";
    this.status = status;
  }
}

// Technical error -> what it means and what to do (pure; exported for tests).
export function explainDeliveryError(channel, raw, statusCode = null) {
  const text = String(raw ?? "").toLowerCase();
  const code = Number(statusCode) || Number((/\(http (\d{3})\)/.exec(text) ?? [])[1]) || null;
  if (!text) return "No se pudo entregar por una causa desconocida.";
  if (text.includes("no configurado") || text.includes("not configured")) {
    if (channel === "email") return "El correo no está configurado: un administrador debe registrar el servidor SMTP de la empresa o de la plataforma.";
    if (channel === "web_push") return "Las notificaciones del navegador no están configuradas en la plataforma (faltan las claves VAPID).";
    return "Las notificaciones del teléfono no están configuradas en el servidor.";
  }
  if (channel === "email") {
    if (/\b535\b|eauth|invalid login|authentication/.test(text)) return "El servidor de correo rechazó el usuario o la contraseña. Revisa las credenciales SMTP.";
    if (/econnrefused|enotfound|etimedout|econnreset|esocket|getaddrinfo/.test(text)) return "No se pudo conectar con el servidor de correo. Revisa el servidor y el puerto SMTP.";
    if (/\b55\d\b|rejected|recipient|mailbox/.test(text)) return "El servidor de correo rechazó la dirección de destino.";
    if (/tls|ssl|certificate/.test(text)) return "Falló la conexión segura con el servidor de correo (TLS/SSL). Revisa el puerto y el cifrado.";
  } else {
    if (code === 404 || code === 410 || /expired|unsubscribed|not.?registered|invalid.?registration/.test(text)) return "El dispositivo ya no está registrado (suscripción vencida). Vuelve a activar las notificaciones en ese dispositivo.";
    if (code === 401 || code === 403 || /vapid|unauthorized|forbidden/.test(text)) return "El servicio de notificaciones rechazó las claves de la plataforma. Un administrador debe revisar la configuración.";
    if (code === 413) return "El mensaje es demasiado grande para el servicio de notificaciones.";
    if (code === 429) return "El servicio de notificaciones limitó los envíos. Intenta de nuevo en unos minutos.";
    if (/econnrefused|enotfound|etimedout|econnreset|getaddrinfo/.test(text)) return "No se pudo conectar con el servicio de notificaciones.";
  }
  return `No se pudo entregar: ${String(raw).slice(0, 160)}`;
}

export function createDeliveryCheckService({ prisma, mailer = null, webPush = null, fcm = null }) {
  const smtp = mailer ?? createCompanyMailer({ prisma });
  const push = webPush ?? createWebPushService({ prisma });
  const phone = fcm ?? createFcmService();

  async function testEmail({ companyId, profileId }) {
    const user = await prisma.userProfile.findUnique({ where: { id: profileId }, select: { email: true } });
    if (!user?.email) return { channel: "email", ok: false, detail: "Tu perfil no tiene un correo registrado." };
    try {
      const html = renderRunlyEmailLayout({ kicker: "Prueba", heading: "Prueba de entrega", bodyHtml: "<p>Si lees esto, los correos de Runly te están llegando.</p>" });
      const text = "Prueba de entrega: si lees esto, los correos de Runly te están llegando.";
      await smtp.sendEmail({ companyId, to: user.email, subject: "Prueba de entrega de avisos de Runly", text, html: typeof html === "string" ? html : undefined });
      const mailerInfo = await smtp.resolve?.(companyId).catch(() => null);
      return { channel: "email", ok: true, detail: `Enviamos un correo de prueba a ${user.email}. Revisa tu bandeja (y el correo no deseado).`, via: mailerInfo?.source === "company" ? "SMTP de la empresa" : "SMTP de la plataforma" };
    } catch (error) {
      return { channel: "email", ok: false, detail: explainDeliveryError("email", error?.message), via: error?.mailSource === "company" ? "SMTP de la empresa" : undefined };
    }
  }

  async function testWebPush({ profileId }) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: profileId, enabled: true }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
    if (!subs.length) return { channel: "web_push", ok: false, detail: "Este usuario no tiene navegadores con las notificaciones activadas. Actívalas en esta pantalla, en «Notificaciones push»." };
    const payload = { title: "Prueba de entrega", body: "Si ves este aviso, las notificaciones del navegador funcionan.", data: { link: "/app/notifications", eventType: "system.test", priority: "medium" } };
    let sent = 0;
    let lastError = null;
    for (const sub of subs) {
      const result = await push.sendToSubscription({ subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload }).catch((error) => ({ ok: false, error: error?.message }));
      if (result.ok) sent += 1;
      else {
        lastError = explainDeliveryError("web_push", result.error, result.statusCode);
        if (result.permanentFailure) await prisma.pushSubscription.update({ where: { id: sub.id }, data: { enabled: false } }).catch(() => {});
      }
    }
    return sent
      ? { channel: "web_push", ok: true, detail: `Enviamos la prueba a ${sent} de ${subs.length} ${subs.length === 1 ? "navegador" : "navegadores"}.${lastError ? ` Uno falló: ${lastError}` : ""}` }
      : { channel: "web_push", ok: false, detail: lastError ?? "No se pudo entregar." };
  }

  async function testFcm({ profileId }) {
    const tokens = await prisma.fcmDeviceToken.findMany({ where: { userId: profileId, enabled: true }, select: { id: true, token: true } });
    if (!tokens.length) return { channel: "fcm", ok: false, detail: "No hay teléfonos registrados con la app para recibir avisos." };
    let sent = 0;
    let lastError = null;
    for (const row of tokens) {
      const result = await phone.sendToToken({ token: row.token, payload: { title: "Prueba de entrega", body: "Si ves este aviso, las notificaciones del teléfono funcionan.", eventType: "system.test" } });
      if (result.ok) sent += 1;
      else {
        lastError = explainDeliveryError("fcm", result.error);
        if (result.permanentFailure) await prisma.fcmDeviceToken.update({ where: { id: row.id }, data: { enabled: false } }).catch(() => {});
      }
    }
    return sent
      ? { channel: "fcm", ok: true, detail: `Enviamos la prueba a ${sent} de ${tokens.length} ${tokens.length === 1 ? "teléfono" : "teléfonos"}.${lastError ? ` Uno falló: ${lastError}` : ""}` }
      : { channel: "fcm", ok: false, detail: lastError ?? "No se pudo entregar." };
  }

  async function test({ companyId, profileId, channel }) {
    if (!CHANNELS.includes(channel)) throw new DeliveryCheckError("Elige un canal válido: correo, navegador o teléfono.");
    if (channel === "email") return testEmail({ companyId, profileId });
    if (channel === "web_push") return testWebPush({ profileId });
    return testFcm({ profileId });
  }

  // Counts per channel and status over the last days, recent failures explained, and what is configured.
  async function health({ companyId, days = 7, now = new Date() }) {
    const since = new Date(now.getTime() - Math.min(Math.max(Number(days) || 7, 1), 30) * 86_400_000);
    const where = { createdAt: { gte: since }, notification: { companyId } };
    const [groups, failures, smtpOk, vapid] = await Promise.all([
      prisma.notificationDelivery.groupBy({ by: ["channel", "status"], where, _count: { _all: true } }),
      prisma.notificationDelivery.findMany({
        where: { ...where, status: "failed" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { channel: true, lastError: true, attempts: true, createdAt: true, notification: { select: { eventType: true, title: true } } },
      }),
      smtp.isConfigured(companyId).catch(() => false),
      push.getVapidConfig().catch(() => ({ configured: false })),
    ]);
    const channels = {};
    for (const group of groups) {
      channels[group.channel] ??= { channel: group.channel, label: CHANNEL_LABELS[group.channel] ?? group.channel, sent: 0, failed: 0, queued: 0 };
      const key = group.status === "sent" ? "sent" : group.status === "failed" ? "failed" : "queued";
      channels[group.channel][key] += group._count._all;
    }
    return {
      days: Math.round((now.getTime() - since.getTime()) / 86_400_000),
      channels: Object.values(channels),
      failures: failures.map((row) => ({
        channel: row.channel,
        label: CHANNEL_LABELS[row.channel] ?? row.channel,
        eventType: row.notification?.eventType ?? null,
        title: row.notification?.title ?? null,
        explanation: explainDeliveryError(row.channel, row.lastError),
        attempts: row.attempts,
        createdAt: row.createdAt,
      })),
      configured: {
        email: Boolean(smtpOk),
        webPush: Boolean(vapid?.configured),
        phone: String(process.env.RUNLY_FCM_ENABLED ?? "true").toLowerCase() !== "false" && Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      },
    };
  }

  return { test, health };
}
