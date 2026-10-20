// Company deletion is catalog-driven (company-deletion-inventory.js): a table is swept when it has a
// company_id column or a foreign key to an owned parent. Pin that the supplier tables qualify, and that
// guests stay out of the user tables (never seats, never user pickers).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync(new URL('../../../../../prisma/schema.prisma', import.meta.url), 'utf8');
const model = (name) => schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';

describe('supplier guest schema', () => {
  for (const name of ['InvGuest', 'InvGuestInvite', 'InvGuestSession']) {
    it(`${name} is owned by a company (company_id + cascade) so company deletion sweeps it`, () => {
      const body = model(name);
      assert.match(body, /companyId\s+String\s+@db\.Uuid @map\("company_id"\)/);
      assert.match(body, /fields: \[companyId\], references: \[id\], onDelete: Cascade/);
    });
  }

  it('guest area members hang from the area (cascade) and from the guest, never from user_profile', () => {
    const body = model('InvAreaMember');
    assert.match(body, /guestId\s+String\?\s+@db\.Uuid @map\("guest_id"\)/);
    assert.match(body, /userId\s+String\?/);
    assert.match(body, /@@unique\(\[areaId, guestId\]\)/);
  });

  it('the migration enforces exactly one principal per membership and no manager guests', () => {
    const sql = readFileSync(new URL('../../../../../prisma/migrations/20261112000000_inventory_guests/migration.sql', import.meta.url), 'utf8');
    assert.match(sql, /CHECK \(\("user_id" IS NOT NULL\) <> \("guest_id" IS NOT NULL\)\)/);
    assert.match(sql, /"guest_id" IS NULL OR "role" IN \('viewer','editor'\)/);
    assert.match(sql, /UNIQUE INDEX "inv_guest_company_email_key"[^;]*lower\("email"\)[^;]*WHERE "enabled"/);
  });
});
