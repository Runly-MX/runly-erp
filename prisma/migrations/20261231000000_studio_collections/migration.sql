-- Personal Studio collections and favorites, accessed only through the authorized API services.
BEGIN;
CREATE TABLE public.studio_collection (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  company_id uuid NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.user_profile(id) ON DELETE CASCADE,
  name varchar(60) NOT NULL CHECK (length(btrim(name)) > 0),
  is_favorites boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_collection_owner ON public.studio_collection(company_id, owner_id, created_at);
CREATE UNIQUE INDEX studio_collection_one_favorites ON public.studio_collection(company_id, owner_id) WHERE is_favorites;
CREATE TABLE public.studio_collection_item (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  collection_id uuid NOT NULL REFERENCES public.studio_collection(id) ON DELETE CASCADE,
  design_id uuid REFERENCES public.studio_design(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.studio_template(id) ON DELETE CASCADE,
  builtin_key varchar(120),
  added_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(design_id, template_id, builtin_key) = 1)
);
CREATE UNIQUE INDEX studio_collection_item_design ON public.studio_collection_item(collection_id, design_id) WHERE design_id IS NOT NULL;
CREATE UNIQUE INDEX studio_collection_item_template ON public.studio_collection_item(collection_id, template_id) WHERE template_id IS NOT NULL;
CREATE UNIQUE INDEX studio_collection_item_builtin ON public.studio_collection_item(collection_id, builtin_key) WHERE builtin_key IS NOT NULL;
CREATE INDEX studio_collection_item_design_ref ON public.studio_collection_item(design_id) WHERE design_id IS NOT NULL;
CREATE INDEX studio_collection_item_template_ref ON public.studio_collection_item(template_id) WHERE template_id IS NOT NULL;
ALTER TABLE public.studio_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_collection_item ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_collection, public.studio_collection_item FROM PUBLIC, anon, authenticated;
COMMIT;
