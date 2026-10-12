-- Punch ids come from the kiosk (UUID v7) but manual punches let the DB generate one.
ALTER TABLE "att_punch" ALTER COLUMN "id" SET DEFAULT uuidv7();
