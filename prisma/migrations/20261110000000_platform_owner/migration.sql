-- Platform owner: one instance-level owner stored in instance_config under
-- key 'platform_owner_profile_id' (value = user_profile.id). Idempotent: does
-- nothing when the key already exists or no candidate is found.
-- Preference: an enabled user with a global system.admin membership, else the
-- oldest enabled runly.admin membership (enabled user and enabled company).
-- Spec: docs/superpowers/specs/2026-10-18-platform-owner-design.md
INSERT INTO "instance_config" ("id", "key", "value", "created_at", "updated_at")
SELECT uuidv7(), 'platform_owner_profile_id', candidate."user_id"::text, now(), now()
  FROM (
    SELECT m."user_id"
      FROM "membership" m
      JOIN "role" r ON r."id" = m."role_id"
      JOIN "user_profile" u ON u."id" = m."user_id"
      JOIN "company" co ON co."id" = m."company_id"
     WHERE m."enabled" = true
       AND u."enabled" = true
       AND u."is_bot" = false
       AND co."enabled" = true
       AND r."enabled" = true
       AND (
         (r."key" = 'system.admin' AND r."company_id" IS NULL)
         OR r."key" = 'runly.admin'
       )
     ORDER BY CASE WHEN r."key" = 'system.admin' THEN 0 ELSE 1 END, m."created_at" ASC
     LIMIT 1
  ) candidate
 WHERE NOT EXISTS (
   SELECT 1 FROM "instance_config" WHERE "key" = 'platform_owner_profile_id'
 );
