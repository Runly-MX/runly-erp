-- READ-ONLY simulation of 20261230110000_studio_template_marketplace_backfill: lists the studio_template
-- rows the migration would reclassify from 'user' to 'marketplace'. Changes nothing. Run it with psql against
-- the instance you are about to migrate (the output contains template names and ids: do not paste it in tickets).
--   psql "$DATABASE_URL" -f scripts/studio-marketplace-backfill-dry-run.sql
SELECT t.id AS template_id, t.company_id, t.owner_id, t.scope, t.name, t.source AS current_source,
       'marketplace' AS new_source, count(j.id) AS matching_jobs, min(j.source->>'releaseId') AS release_id
FROM public.studio_template t
JOIN public.studio_interchange_job j
  ON j.state = 'committed'
 AND j.source->>'kind' = 'marketplace'
 AND j.result->>'kind' = 'template'
 AND j.result->>'id' = t.id::text
 AND j.company_id = t.company_id
 AND j.actor_id = t.owner_id
WHERE t.source = 'user'
GROUP BY t.id
ORDER BY t.company_id, t.name;
