-- Inventory public item link: opaque revocable token per item (additive).
CREATE TABLE "inv_public_token" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_public_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inv_public_token_token_hash_key" ON "inv_public_token"("token_hash");
CREATE INDEX "inv_public_token_company_id_item_id_idx" ON "inv_public_token"("company_id", "item_id");
-- One active token per item.
CREATE UNIQUE INDEX "inv_public_token_item_active_key" ON "inv_public_token"("item_id") WHERE "revoked_at" IS NULL;

ALTER TABLE "inv_public_token" ADD CONSTRAINT "inv_public_token_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inv_public_token" ADD CONSTRAINT "inv_public_token_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
