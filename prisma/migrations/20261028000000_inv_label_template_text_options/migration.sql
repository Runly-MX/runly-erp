-- Inventory labels: per-template text options (field names, fixed font size). Additive.
ALTER TABLE "inv_label_template" ADD COLUMN "text_options" JSONB NOT NULL DEFAULT '{}';
