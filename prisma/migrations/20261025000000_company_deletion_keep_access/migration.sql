-- Companies awaiting deletion stay accessible (writes are frozen by the lifecycle
-- guards); only the purge disables them. Re-enable those suspended by the earlier flow.
SELECT set_config('runly.lifecycle_purge', 'on', false);
UPDATE public.company c SET enabled = d.previous_enabled
FROM runly_lifecycle.company_deletion d
WHERE d.company_id = c.id AND d.state = 'PENDING' AND d.purge_after > now();
SELECT set_config('runly.lifecycle_purge', 'off', false);
