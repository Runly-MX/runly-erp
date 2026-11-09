-- Templates imported from the Marketplace before source='marketplace' existed were stored as 'user'.
-- Only rows with hard evidence are reclassified: a committed import job whose verified provenance
-- (source.kind='marketplace') points at this very template, in the same company and by the same actor.
UPDATE public.studio_template t
SET source = 'marketplace'
FROM public.studio_interchange_job j
WHERE t.source = 'user'
  AND j.state = 'committed'
  AND j.source->>'kind' = 'marketplace'
  AND j.result->>'kind' = 'template'
  AND j.result->>'id' = t.id::text
  AND j.company_id = t.company_id
  AND j.actor_id = t.owner_id;
