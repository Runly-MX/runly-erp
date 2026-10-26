-- Official Studio storage, accessed only through the authorized API services.
BEGIN;
CREATE TABLE public.studio_template (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.user_profile(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','company')),
  name varchar(160) NOT NULL CHECK (length(btrim(name)) > 0),
  category varchar(80) NOT NULL DEFAULT '',
  description varchar(1000) NOT NULL DEFAULT '',
  document jsonb NOT NULL CHECK (octet_length(document::text) <= 1100000),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai')),
  source_design_id uuid REFERENCES public.studio_design(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_template_scope_updated ON public.studio_template(company_id,scope,updated_at DESC,id) WHERE enabled;
CREATE INDEX studio_template_owner_updated ON public.studio_template(company_id,owner_id,updated_at DESC,id) WHERE enabled;
CREATE TABLE public.studio_template_asset (
  template_id uuid NOT NULL REFERENCES public.studio_template(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.file_asset(id) ON DELETE CASCADE,
  added_by uuid NOT NULL REFERENCES public.user_profile(id),
  PRIMARY KEY(template_id,file_id)
);
ALTER TABLE public.studio_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_template_asset ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_template,public.studio_template_asset FROM PUBLIC,anon,authenticated;
-- No grants to roles: normal module sync adds permission definitions only.
COMMIT;
