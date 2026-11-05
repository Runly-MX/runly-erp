-- Per-company arrangement of a blueprint-driven detail screen.
CREATE TABLE "company_detail_view" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "view_key" VARCHAR(100) NOT NULL,
    "schema" JSONB NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_detail_view_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_detail_view_company_id_view_key_key" ON "company_detail_view"("company_id", "view_key");

ALTER TABLE "company_detail_view" ADD CONSTRAINT "company_detail_view_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_detail_view" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "company_detail_view" FROM anon, authenticated;
