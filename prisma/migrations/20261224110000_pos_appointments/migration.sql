-- POS appointments: booked with client and catalog services, charged from Caja.
CREATE TYPE "pos_appointment_status" AS ENUM ('SCHEDULED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TABLE "pos_appointment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "contact_id" UUID,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "items" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "status" "pos_appointment_status" NOT NULL DEFAULT 'SCHEDULED',
    "order_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_appointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_appointment_company_id_starts_at_idx" ON "pos_appointment"("company_id", "starts_at");
CREATE INDEX "pos_appointment_company_id_status_idx" ON "pos_appointment"("company_id", "status");

ALTER TABLE "pos_appointment" ADD CONSTRAINT "pos_appointment_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "pos_outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE pos_appointment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pos_appointment FROM PUBLIC;
