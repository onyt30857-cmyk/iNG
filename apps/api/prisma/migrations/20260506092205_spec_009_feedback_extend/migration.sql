-- AlterTable
ALTER TABLE "prompt_feedback" ADD COLUMN     "bubble_text" TEXT,
ADD COLUMN     "relationship_id" TEXT,
ALTER COLUMN "session_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "prompt_feedback_user_id_created_at_idx" ON "prompt_feedback"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "prompt_feedback_relationship_id_feedback_type_idx" ON "prompt_feedback"("relationship_id", "feedback_type");
