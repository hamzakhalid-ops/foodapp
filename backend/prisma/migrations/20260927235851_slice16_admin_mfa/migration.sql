-- The two ALTER COLUMN statements below re-state the existing defaults in PostgreSQL's normalized
-- form (no behaviour change); schema.prisma now uses the same form so they do not recur.

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "invoice_number" SET DEFAULT ('QB-INV-'::text || lpad(nextval('invoice_number_seq'::regclass)::text, 6, '0'));

-- AlterTable
ALTER TABLE "support_tickets" ALTER COLUMN "ticket_number" SET DEFAULT ('QB-SUP-'::text || lpad(nextval('support_ticket_number_seq'::regclass)::text, 6, '0'));

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "mfa_verified_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "user_mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "last_used_step" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_factors_user_id_key" ON "user_mfa_factors"("user_id");

-- AddForeignKey
ALTER TABLE "user_mfa_factors" ADD CONSTRAINT "user_mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
