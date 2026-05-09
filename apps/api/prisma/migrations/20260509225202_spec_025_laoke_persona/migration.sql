-- CreateTable
CREATE TABLE "laoke_persona" (
    "id" TEXT NOT NULL DEFAULT 'laoke',
    "identity_summary" TEXT NOT NULL,
    "age" INTEGER NOT NULL DEFAULT 32,
    "role" TEXT NOT NULL DEFAULT '兄长型 AI',
    "signature_phrases" TEXT[],
    "forbidden_phrases" TEXT[],
    "judgment_style" TEXT NOT NULL,
    "recognizes" TEXT[],
    "formatting_rules" TEXT NOT NULL,
    "do_not_change_warnings" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laoke_persona_pkey" PRIMARY KEY ("id")
);

