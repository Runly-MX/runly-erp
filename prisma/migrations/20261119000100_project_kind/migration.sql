-- Personal "Mis tareas" projects. Additive: new column plus a partial unique index.
ALTER TABLE "project" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'STANDARD';

CREATE UNIQUE INDEX "project_personal_owner_key" ON "project"("company_id", "owner_id") WHERE "kind" = 'PERSONAL';
