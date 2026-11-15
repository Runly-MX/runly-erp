-- Heartbeat monitors: last time the monitored system pinged Runly.
ALTER TABLE "growth_monitor" ADD COLUMN IF NOT EXISTS "last_ping_at" TIMESTAMP(3);
