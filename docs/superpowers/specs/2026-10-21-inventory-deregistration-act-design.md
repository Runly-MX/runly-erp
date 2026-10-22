# runly.inventory — Acta de baja y bitácora de bajas

Date: 2026-10-21
Status: approved (autonomous roadmap mode)
Related: `2026-09-28-inventory-admin-status-design.md`, `2026-10-13-inventory-custody-design.md`

## 1. Problem

Authorizing a baja was a button: one `approve_deregistration` event with an optional
comment. In practice a baja needs a signed *acta de baja* with every available detail
(who proposed, why, history, evidence, asset data), and administration needs to see
when each baja happened. Comments of proposals and bajas were also not found by the
inventory search.

## 2. Scope

In:
- `InvDeregistrationAct` (`inv_deregistration_act`): folio `BAJA-YYYY-NNNN` (advisory-lock
  sequence per company/year), effective date, reason (null when a lote mixes reasons),
  approver name/title snapshot, signature file, PDF file, and an `items` JSON snapshot
  of every asset (data, holder, proposal, history, evidence names).
- Approving (single or bulk) creates one act: bulk shares one act per lote. The approver
  signs by drawing, applying the saved profile signature, or choosing to sign the printed
  acta (`signOnPaper`). The act PDF (pdfkit, company branding) is stored as a FileAsset and
  linked to every asset (InvItemFile). A failure generating the act never undoes the
  approval; the act can be regenerated.
- `InvItemAdminEvent.actId` links each approval event to its act.
- "Bajas" screen (`/inventory/deregistrations`): one row per baja with date, reason,
  proposal (who/when/comment), authorization (who/when/comment), act download, reverted
  badge, filters (dates, reason, situation, text) and header counters.
- Search: the list search no longer hides bajas; new sources: acta folio/approver/
  comments, change-proposal messages and review notes; reasons and actions are matched by
  their Spanish label.

Out: multi-step approval chains, templated (docx) actas, e-mailing the acta.

## 3. API

- `POST /inventory/items/:id/admin-transition` and `.../bulk` (`approve_deregistration`)
  accept `signature: { pngBase64 } | { useSaved: true }`, `signOnPaper`, `approverTitle`;
  one of signature/signOnPaper is required. Response adds `act` (bulk: top level `act`).
- `GET /inventory/deregistrations` (filters `search, from, to, reason, state, page, pageSize`),
  `GET /inventory/deregistrations/summary`.
- `GET /inventory/deregistration-acts/:id`, `.../document` (signed URL),
  `POST .../regenerate` (needs `inventory.item.deregister`). Area scoping: an act is
  visible only when every asset it lists is inside the caller's areas.

## 4. Verification

Verified: 2026-10-21 (node --test admin service + PDF + search suites; real-DB run against
the test company: propose, bulk approve with signature, one act, PDF stored, search by
proposal comment / folio, regenerate; vite build; eslint).
