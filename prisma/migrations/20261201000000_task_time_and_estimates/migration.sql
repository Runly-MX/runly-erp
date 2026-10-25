-- Effort data for Projects: an estimate per task, time entries (manual and timer) and a
-- weekly capacity per project member. Additive only.
ALTER TABLE "task" ADD COLUMN "estimate_minutes" INTEGER;
ALTER TABLE "project_member" ADD COLUMN "weekly_capacity_minutes" INTEGER;

CREATE TABLE "task_time_entry" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "minutes" INTEGER,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_time_entry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "task_time_entry_source_check" CHECK ("source" IN ('manual', 'timer')),
    CONSTRAINT "task_time_entry_minutes_check" CHECK ("minutes" IS NULL OR ("minutes" >= 1 AND "minutes" <= 1440))
);

CREATE INDEX "task_time_entry_task_id_idx" ON "task_time_entry"("task_id");
CREATE INDEX "task_time_entry_company_id_user_id_started_at_idx" ON "task_time_entry"("company_id", "user_id", "started_at");
-- A person has at most one running timer (minutes is null while it runs).
CREATE UNIQUE INDEX "task_time_entry_one_running_per_user" ON "task_time_entry"("user_id") WHERE "minutes" IS NULL;

ALTER TABLE "task_time_entry" ADD CONSTRAINT "task_time_entry_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
