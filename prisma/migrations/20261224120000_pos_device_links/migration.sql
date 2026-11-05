-- Registers opened from a link (device pairing) and cashier PINs.
CREATE TABLE "pos_device_link" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "terminal_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "link_token" TEXT NOT NULL,
    "device_token_hash" TEXT,
    "pairing_code" TEXT,
    "pairing_secret_hash" TEXT,
    "pairing_label" TEXT,
    "pairing_requested_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "pairing_token_enc" TEXT,
    "paired_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "failed_pin_attempts" INTEGER NOT NULL DEFAULT 0,
    "pin_locked_until" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_device_link_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_operator_pin" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_operator_pin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_device_link_link_token_key" ON "pos_device_link"("link_token");
CREATE INDEX "pos_device_link_company_id_idx" ON "pos_device_link"("company_id");
CREATE UNIQUE INDEX "pos_operator_pin_company_id_user_id_key" ON "pos_operator_pin"("company_id", "user_id");
CREATE UNIQUE INDEX "pos_operator_pin_company_id_pin_hash_key" ON "pos_operator_pin"("company_id", "pin_hash");

ALTER TABLE "pos_device_link" ADD CONSTRAINT "pos_device_link_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "pos_terminal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE pos_device_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_operator_pin ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_device_link, pos_operator_pin, pos_appointment FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON pos_device_link, pos_operator_pin, pos_appointment FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON pos_device_link, pos_operator_pin, pos_appointment FROM authenticated; END IF;
END $$;
