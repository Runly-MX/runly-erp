-- Public status page of a Growth property (opt-in, unguessable slug).
CREATE TABLE "growth_status_page" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "growth_status_page_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "growth_status_page_property_id_key" ON "growth_status_page"("property_id");
CREATE UNIQUE INDEX "growth_status_page_slug_key" ON "growth_status_page"("slug");
CREATE INDEX "growth_status_page_company_id_idx" ON "growth_status_page"("company_id");
