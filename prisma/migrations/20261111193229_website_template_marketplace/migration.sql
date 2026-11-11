BEGIN;
-- Durable Files saga only; pages/themes remain in the existing Website model.
CREATE TABLE website_template_job (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 company_id uuid NOT NULL REFERENCES company(id),
 site_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES user_profile(id),
 key_hash text NOT NULL,
 request_hash text NOT NULL,
 source jsonb NOT NULL,
 state text NOT NULL DEFAULT 'preparing' CHECK(state IN ('preparing','committed','cleanup','cancelled')),
 staged jsonb NOT NULL DEFAULT '[]',
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz NOT NULL DEFAULT now()+interval '2 minutes',
 next_cleanup_at timestamptz DEFAULT now()+interval '2 minutes',
 UNIQUE(company_id,site_id,actor_id,key_hash),
 FOREIGN KEY(company_id,site_id) REFERENCES website_site(company_id,id)
);
CREATE INDEX website_template_job_cleanup ON website_template_job(next_cleanup_at) WHERE state<>'committed';
ALTER TABLE website_template_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_template_job FORCE ROW LEVEL SECURITY;
REVOKE ALL ON website_template_job FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON website_template_job FROM anon; END IF;
 IF EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON website_template_job FROM authenticated; END IF;
END $$;
COMMIT;
