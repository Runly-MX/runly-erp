// inventory-guest-branding.js - company identity shown in the supplier portal (name, logo, primary color).
// Read-only and public-safe: the logo is a short-lived signed URL, nothing else of the company is exposed.
export async function loadGuestBranding({ prisma, companyId, signFile = null }) {
  const company = await prisma.company
    .findUnique({ where: { id: companyId }, select: { name: true, brandingConfig: { select: { logoFileId: true, primaryColor: true } } } })
    .catch(() => null);
  const logoFileId = company?.brandingConfig?.logoFileId ?? null;
  const logoUrl = logoFileId && signFile ? await signFile(logoFileId, 'full').catch(() => null) : null;
  return { name: company?.name ?? null, logoUrl: logoUrl ?? null, primaryColor: company?.brandingConfig?.primaryColor ?? null };
}
