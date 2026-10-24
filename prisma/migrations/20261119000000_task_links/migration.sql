-- Links from tasks to records of other modules. Additive: new table only.
CREATE TABLE "task_link" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "label" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_link_task_id_target_type_target_id_key" ON "task_link"("task_id", "target_type", "target_id");

CREATE INDEX "task_link_company_id_target_type_target_id_idx" ON "task_link"("company_id", "target_type", "target_id");

ALTER TABLE "task_link" ADD CONSTRAINT "task_link_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
