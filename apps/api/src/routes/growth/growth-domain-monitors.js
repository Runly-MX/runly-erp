import { createGrowthPropertyService } from "./growth-property-service.js";

// When a custom website domain is verified, watch it with Growth monitors (availability, SSL, domain
// expiry). Best effort and idempotent: it never creates duplicates and silently does nothing when Growth
// is not installed or disabled for the company. Called by website-custom-domain-service `onVerified`.
export function createGrowthDomainMonitorsHook({ prisma, propertyService = createGrowthPropertyService({ prisma }) }) {
  return async function onVerified({ companyId, siteId, hostname }) {
    const growth = await prisma.runlyModule.findFirst({ where: { key: "runly.growth", status: "INSTALLED", enabled: true }, select: { id: true } });
    if (!growth) return { skipped: "growth_not_installed", created: 0 };
    const off = await prisma.companyModule.findFirst({ where: { companyId, moduleId: growth.id, enabled: false }, select: { moduleId: true } });
    if (off) return { skipped: "growth_disabled_for_company", created: 0 };

    // The property mirrors the website site (created on first use, same as the Growth screens do).
    const property = await propertyService.resolveProperty({ companyId, propertyId: siteId });
    if (!property) return { skipped: "no_property", created: 0 };

    const existing = await prisma.growthMonitor.findMany({ where: { companyId, propertyId: property.id }, select: { type: true, config: true } });
    const has = (type, key, value) => existing.some((m) => m.type === type && m.config?.[key] === value);
    const wanted = [
      { type: "http", key: "url", value: `https://${hostname}/`, name: `${hostname} - disponibilidad`, config: { url: `https://${hostname}/`, method: "GET" } },
      { type: "ssl", key: "host", value: hostname, name: `${hostname} - certificado SSL`, config: { host: hostname, port: 443, warnDays: 14 } },
      { type: "domain", key: "host", value: hostname, name: `${hostname} - vencimiento del dominio`, config: { host: hostname, warnDays: 30 }, intervalSeconds: 86400 },
    ].filter((m) => !has(m.type, m.key, m.value));

    for (const m of wanted) {
      await prisma.growthMonitor.create({
        data: { companyId, propertyId: property.id, type: m.type, name: m.name, config: m.config, ...(m.intervalSeconds ? { intervalSeconds: m.intervalSeconds } : {}) },
      });
    }
    return { created: wanted.length };
  };
}
