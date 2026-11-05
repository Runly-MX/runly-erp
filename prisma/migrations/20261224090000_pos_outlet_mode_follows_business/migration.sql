-- The POS business mode ("Modalidad de negocio") is now the single mode every
-- outlet follows. Align outlets saved before that with their company's mode,
-- except an outlet that would turn retail while it still has open table accounts.
UPDATE "pos_outlet" o
SET "mode" = s."mode"
FROM "pos_settings" s
WHERE s."company_id" = o."company_id"
  AND o."mode" <> s."mode"
  AND NOT (
    s."mode" = 'RETAIL'
    AND EXISTS (
      SELECT 1 FROM "pos_order" r
      WHERE r."outlet_id" = o."id"
        AND r."experience" = 'RESTAURANT'
        AND r."status" IN ('DRAFT', 'OPEN', 'SENT', 'PARTIALLY_SERVED', 'SERVED')
    )
  );
