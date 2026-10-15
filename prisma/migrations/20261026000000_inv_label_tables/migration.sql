-- Inventory labels: templates, printers and the print log (additive).
CREATE TABLE "inv_label_template" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "width_mm" DOUBLE PRECISION NOT NULL,
    "height_mm" DOUBLE PRECISION NOT NULL,
    "dpi" INTEGER NOT NULL DEFAULT 203,
    "layout" VARCHAR(20) NOT NULL DEFAULT 'qr-left',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "qr_options" JSONB NOT NULL DEFAULT '{}',
    "logo_file_id" UUID,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inv_label_template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inv_label_printer" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "format" VARCHAR(10) NOT NULL DEFAULT 'pdf',
    "dpi" INTEGER NOT NULL DEFAULT 203,
    "transport" VARCHAR(20) NOT NULL DEFAULT 'browser',
    "address" VARCHAR(255),
    "default_template_id" UUID,
    "media_width_mm" DOUBLE PRECISION,
    "media_height_mm" DOUBLE PRECISION,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inv_label_printer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inv_label_print" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "template_id" UUID,
    "printer_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "user_id" UUID,
    "printed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_label_print_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inv_label_template_company_id_enabled_idx" ON "inv_label_template"("company_id", "enabled");
CREATE INDEX "inv_label_printer_company_id_enabled_idx" ON "inv_label_printer"("company_id", "enabled");
CREATE INDEX "inv_label_print_company_id_item_id_printed_at_idx" ON "inv_label_print"("company_id", "item_id", "printed_at");
CREATE INDEX "inv_label_print_company_id_printed_at_idx" ON "inv_label_print"("company_id", "printed_at");

ALTER TABLE "inv_label_template" ADD CONSTRAINT "inv_label_template_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inv_label_printer" ADD CONSTRAINT "inv_label_printer_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inv_label_printer" ADD CONSTRAINT "inv_label_printer_default_template_id_fkey" FOREIGN KEY ("default_template_id") REFERENCES "inv_label_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inv_label_print" ADD CONSTRAINT "inv_label_print_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inv_label_print" ADD CONSTRAINT "inv_label_print_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inv_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inv_label_print" ADD CONSTRAINT "inv_label_print_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "inv_label_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inv_label_print" ADD CONSTRAINT "inv_label_print_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "inv_label_printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inv_label_print" ADD CONSTRAINT "inv_label_print_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
