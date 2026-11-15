-- Heartbeat pings look monitors up by token hash on an unauthenticated endpoint: index it.
CREATE INDEX IF NOT EXISTS "growth_monitor_heartbeat_token_idx"
  ON "growth_monitor" ((config->>'tokenHash')) WHERE type = 'heartbeat';

-- At most one open incident per monitor, even if two checks race.
CREATE UNIQUE INDEX IF NOT EXISTS "growth_incident_one_open_per_monitor"
  ON "growth_incident" ("monitor_id") WHERE "resolved_at" IS NULL;
