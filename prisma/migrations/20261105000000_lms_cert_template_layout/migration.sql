-- runly.lms: field layout for certificate templates built on an uploaded PDF (spec 16)

ALTER TABLE "lms_certificate_template" ADD COLUMN "layout" JSONB NOT NULL DEFAULT '{}';
