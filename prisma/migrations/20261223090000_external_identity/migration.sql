-- External Identity: accounts outside Runly, isolated per realm (module + owner).
CREATE TABLE "external_realm" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "company_id" UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
  "module_key" TEXT NOT NULL,
  "owner_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "allow_signup" BOOLEAN NOT NULL DEFAULT true,
  "require_email_verification" BOOLEAN NOT NULL DEFAULT true,
  "session_days" INTEGER NOT NULL DEFAULT 30,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "external_realm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_realm_module_key_owner_id_key" ON "external_realm"("module_key", "owner_id");
CREATE INDEX "external_realm_company_id_idx" ON "external_realm"("company_id");

CREATE TABLE "external_account" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "realm_id" UUID NOT NULL REFERENCES "external_realm"("id") ON DELETE CASCADE,
  "company_id" UUID NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "phone" TEXT,
  "email_verified_at" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'active',
  "contact_id" UUID REFERENCES "contact"("id") ON DELETE SET NULL,
  "failed_logins" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ,
  "last_login_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "external_account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_account_realm_id_email_key" ON "external_account"("realm_id", "email");
CREATE INDEX "external_account_company_id_idx" ON "external_account"("company_id");

CREATE TABLE "external_session" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "account_id" UUID NOT NULL REFERENCES "external_account"("id") ON DELETE CASCADE,
  "realm_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "user_agent" TEXT,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "external_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_session_token_hash_key" ON "external_session"("token_hash");
CREATE INDEX "external_session_account_id_idx" ON "external_session"("account_id");
CREATE INDEX "external_session_expires_at_idx" ON "external_session"("expires_at");

CREATE TABLE "external_account_token" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "account_id" UUID NOT NULL REFERENCES "external_account"("id") ON DELETE CASCADE,
  "purpose" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "external_account_token_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_account_token_token_hash_key" ON "external_account_token"("token_hash");
CREATE INDEX "external_account_token_account_id_purpose_idx" ON "external_account_token"("account_id", "purpose");
