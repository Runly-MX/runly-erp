-- Legacy import ledger (spec 2026-10-14-legacy-import-toolkit-design §2)
-- CreateTable
CREATE TABLE "legacy_ref" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "legacy_id" VARCHAR(120) NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_ref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legacy_ref_company_id_source_entity_legacy_id_key" ON "legacy_ref"("company_id", "source", "entity", "legacy_id");

-- CreateIndex
CREATE INDEX "legacy_ref_company_id_target_id_idx" ON "legacy_ref"("company_id", "target_id");

ALTER TABLE "legacy_ref" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "legacy_ref" FROM PUBLIC, anon, authenticated;
