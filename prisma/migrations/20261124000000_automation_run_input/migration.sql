-- What reached an automation run (trigger data), shown in the editor console. Additive: one nullable column.
ALTER TABLE "automation_run" ADD COLUMN "input" JSONB;
