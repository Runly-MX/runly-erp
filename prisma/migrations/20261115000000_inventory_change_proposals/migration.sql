-- runly.inventory: change proposals for items the proposer cannot open (restricted duplicates). Additive.
CREATE TABLE "inv_change_proposal" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'change',
    "matched_field" VARCHAR(20) NOT NULL,
    "matched_value" VARCHAR(255) NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "message" VARCHAR(1000),
    "proposer_user_id" UUID,
    "proposer_guest_id" UUID,
    "proposer_label" VARCHAR(200) NOT NULL,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inv_change_proposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inv_change_proposal_company_id_status_created_at_idx" ON "inv_change_proposal"("company_id", "status", "created_at");
CREATE INDEX "inv_change_proposal_item_id_idx" ON "inv_change_proposal"("item_id");
