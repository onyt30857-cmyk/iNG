-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "notes" TEXT,
    "deployed_at" TIMESTAMPTZ,
    "rolled_back_at" TIMESTAMPTZ,
    "rollout_pct" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_eval_datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt_name" TEXT,
    "description" TEXT,
    "samples" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "prompt_eval_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_evals" (
    "id" TEXT NOT NULL,
    "prompt_version_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "judge_model" TEXT NOT NULL,
    "score" DECIMAL(5,4) NOT NULL,
    "raw_results" JSONB NOT NULL,
    "total_samples" INTEGER NOT NULL,
    "passed_samples" INTEGER NOT NULL,
    "run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_evals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_queues" (
    "id" TEXT NOT NULL,
    "batch_name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_items" (
    "id" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "score_persona" DECIMAL(3,2),
    "score_accuracy" DECIMAL(3,2),
    "score_helpfulness" DECIMAL(3,2),
    "score_empathy" DECIMAL(3,2),
    "score_safety" DECIMAL(3,2),
    "tags" TEXT[],
    "note" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "added_to_eval" BOOLEAN NOT NULL DEFAULT false,
    "added_to_eval_dataset_id" TEXT,

    CONSTRAINT "annotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavior_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "relationship_id" TEXT,
    "message_id" TEXT,
    "event_type" TEXT NOT NULL,
    "reference_at" TIMESTAMPTZ,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompt_versions_name_deployed_at_idx" ON "prompt_versions"("name", "deployed_at");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_name_version_key" ON "prompt_versions"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_eval_datasets_name_key" ON "prompt_eval_datasets"("name");

-- CreateIndex
CREATE INDEX "prompt_evals_prompt_version_id_run_at_idx" ON "prompt_evals"("prompt_version_id", "run_at");

-- CreateIndex
CREATE INDEX "annotation_queues_status_created_at_idx" ON "annotation_queues"("status", "created_at");

-- CreateIndex
CREATE INDEX "annotation_items_queue_id_reviewer_id_idx" ON "annotation_items"("queue_id", "reviewer_id");

-- CreateIndex
CREATE INDEX "annotation_items_call_id_idx" ON "annotation_items"("call_id");

-- CreateIndex
CREATE INDEX "behavior_events_user_id_event_type_created_at_idx" ON "behavior_events"("user_id", "event_type", "created_at");

-- CreateIndex
CREATE INDEX "behavior_events_message_id_idx" ON "behavior_events"("message_id");

-- CreateIndex
CREATE INDEX "behavior_events_event_type_created_at_idx" ON "behavior_events"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "prompt_evals" ADD CONSTRAINT "prompt_evals_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_evals" ADD CONSTRAINT "prompt_evals_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "prompt_eval_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_items" ADD CONSTRAINT "annotation_items_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "annotation_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

