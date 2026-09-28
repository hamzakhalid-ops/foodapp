-- CreateEnum
CREATE TYPE "risk_subject_type" AS ENUM ('CUSTOMER', 'RESTAURANT', 'RIDER');

-- CreateEnum
CREATE TYPE "risk_event_type" AS ENUM ('COD_NON_RECEIPT', 'REPEATED_ORDER_CANCELLATION', 'REPEATED_PAYMENT_FAILURE', 'SUSPICIOUS_ORDER_PATTERN', 'MULTIPLE_FAILED_DELIVERIES', 'EXCESSIVE_REFUNDS', 'ABNORMAL_ORDER_FREQUENCY', 'SUSPICIOUS_ACCOUNT_ACTIVITY', 'REPEATED_FALSE_COMPLAINT');

-- CreateEnum
CREATE TYPE "risk_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "risk_action" AS ENUM ('NORMAL', 'MONITORED', 'COD_RESTRICTED', 'ADDITIONAL_VERIFICATION', 'ORDER_RESTRICTED', 'ACCOUNT_RESTRICTED');

-- CreateEnum
CREATE TYPE "risk_flag_status" AS ENUM ('ACTIVE', 'RESOLVED', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "risk_restriction_type" AS ENUM ('COD_RESTRICTED', 'ORDER_RESTRICTED', 'ADDITIONAL_VERIFICATION', 'ACCOUNT_RESTRICTED');

-- CreateEnum
CREATE TYPE "risk_restriction_status" AS ENUM ('ACTIVE', 'REMOVED', 'EXPIRED');

-- CreateTable
CREATE TABLE "risk_events" (
    "id" UUID NOT NULL,
    "subject_type" "risk_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "event_type" "risk_event_type" NOT NULL,
    "severity" "risk_severity" NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject_type" "risk_subject_type" NOT NULL,
    "event_type" "risk_event_type" NOT NULL,
    "threshold" INTEGER NOT NULL,
    "window_seconds" INTEGER NOT NULL,
    "action" "risk_action" NOT NULL,
    "severity" "risk_severity" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "risk_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "id" UUID NOT NULL,
    "subject_type" "risk_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "risk_rule_id" UUID,
    "status" "risk_flag_status" NOT NULL DEFAULT 'ACTIVE',
    "severity" "risk_severity" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_restrictions" (
    "id" UUID NOT NULL,
    "subject_type" "risk_subject_type" NOT NULL,
    "subject_id" UUID NOT NULL,
    "restriction_type" "risk_restriction_type" NOT NULL,
    "status" "risk_restriction_status" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "reason" TEXT NOT NULL,
    "risk_flag_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_events_subject_type_subject_id_event_type_occurred_at_idx" ON "risk_events"("subject_type", "subject_id", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "risk_rules_subject_type_event_type_is_enabled_idx" ON "risk_rules"("subject_type", "event_type", "is_enabled");

-- CreateIndex
CREATE INDEX "risk_flags_subject_type_subject_id_status_idx" ON "risk_flags"("subject_type", "subject_id", "status");

-- CreateIndex
CREATE INDEX "risk_restrictions_subject_type_subject_id_status_idx" ON "risk_restrictions"("subject_type", "subject_id", "status");

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_risk_rule_id_fkey" FOREIGN KEY ("risk_rule_id") REFERENCES "risk_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_restrictions" ADD CONSTRAINT "risk_restrictions_risk_flag_id_fkey" FOREIGN KEY ("risk_flag_id") REFERENCES "risk_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Concurrency-safe evaluation (RISK_RULES §42): one active flag per subject+rule and one active
-- restriction per subject+type.
CREATE UNIQUE INDEX "risk_flags_one_active" ON "risk_flags"("subject_type", "subject_id", "risk_rule_id") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "risk_restrictions_one_active" ON "risk_restrictions"("subject_type", "subject_id", "restriction_type") WHERE "status" = 'ACTIVE';
ALTER TABLE "risk_rules" ADD CONSTRAINT "risk_rules_positive" CHECK ("threshold" > 0 AND "window_seconds" > 0);
