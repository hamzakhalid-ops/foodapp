-- CreateEnum
CREATE TYPE "earning_status" AS ENUM ('AVAILABLE', 'IN_SETTLEMENT', 'SETTLED');

-- CreateEnum
CREATE TYPE "settlement_recipient_type" AS ENUM ('RESTAURANT', 'RIDER');

-- CreateEnum
CREATE TYPE "settlement_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "settlement_source_type" AS ENUM ('RESTAURANT_EARNING', 'RIDER_EARNING', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('ISSUED');

-- AlterTable
ALTER TABLE "support_tickets" ALTER COLUMN "ticket_number" SET DEFAULT ('QB-SUP-'::text || lpad(nextval('support_ticket_number_seq'::regclass)::text, 6, '0'));

-- Backend-generated invoice numbers, e.g. QB-INV-000001 (FINANCIAL_SPEC §45).
CREATE SEQUENCE "invoice_number_seq" START WITH 1;

-- CreateTable
CREATE TABLE "restaurant_earnings" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "commission_percent" DECIMAL(7,4) NOT NULL,
    "commission_amount" DECIMAL(12,2) NOT NULL,
    "fee_amount" DECIMAL(12,2) NOT NULL,
    "refund_amount" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "earning_status" NOT NULL DEFAULT 'AVAILABLE',
    "settlement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_earnings" (
    "id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "bonus_amount" DECIMAL(12,2) NOT NULL,
    "adjustment_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "earning_status" NOT NULL DEFAULT 'AVAILABLE',
    "settlement_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rider_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" UUID NOT NULL,
    "recipient_type" "settlement_recipient_type" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "status" "earning_status" NOT NULL DEFAULT 'AVAILABLE',
    "settlement_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL,
    "recipient_type" "settlement_recipient_type" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "fees" DECIMAL(12,2) NOT NULL,
    "adjustments" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "settlement_status" NOT NULL DEFAULT 'PENDING',
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "processed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_items" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "source_type" "settlement_source_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "recipient_type" "settlement_recipient_type" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "payout_status" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "initiated_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "recipient_type" "settlement_recipient_type" NOT NULL,
    "recipient_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL DEFAULT ('QB-INV-'::text || lpad(nextval('invoice_number_seq'::regclass)::text, 6, '0')),
    "file_url" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_earnings_order_id_key" ON "restaurant_earnings"("order_id");

-- CreateIndex
CREATE INDEX "restaurant_earnings_restaurant_id_created_at_idx" ON "restaurant_earnings"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "restaurant_earnings_status_created_at_idx" ON "restaurant_earnings"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rider_earnings_delivery_id_key" ON "rider_earnings"("delivery_id");

-- CreateIndex
CREATE INDEX "rider_earnings_rider_id_created_at_idx" ON "rider_earnings"("rider_id", "created_at");

-- CreateIndex
CREATE INDEX "rider_earnings_status_created_at_idx" ON "rider_earnings"("status", "created_at");

-- CreateIndex
CREATE INDEX "financial_adjustments_recipient_type_recipient_id_created_a_idx" ON "financial_adjustments"("recipient_type", "recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "financial_adjustments_status_created_at_idx" ON "financial_adjustments"("status", "created_at");

-- CreateIndex
CREATE INDEX "settlements_status_created_at_idx" ON "settlements"("status", "created_at");

-- CreateIndex
CREATE INDEX "settlements_recipient_type_recipient_id_created_at_idx" ON "settlements"("recipient_type", "recipient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_recipient_type_recipient_id_period_start_key" ON "settlements"("recipient_type", "recipient_id", "period_start");

-- CreateIndex
CREATE INDEX "settlement_items_settlement_id_idx" ON "settlement_items"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_items_source_type_source_id_key" ON "settlement_items"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_provider_reference_key" ON "payouts"("provider_reference");

-- CreateIndex
CREATE INDEX "payouts_status_created_at_idx" ON "payouts"("status", "created_at");

-- CreateIndex
CREATE INDEX "payouts_recipient_type_recipient_id_created_at_idx" ON "payouts"("recipient_type", "recipient_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_settlement_id_key" ON "invoices"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_recipient_type_recipient_id_issued_at_idx" ON "invoices"("recipient_type", "recipient_id", "issued_at");

-- AddForeignKey
ALTER TABLE "restaurant_earnings" ADD CONSTRAINT "restaurant_earnings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_earnings" ADD CONSTRAINT "restaurant_earnings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_earnings" ADD CONSTRAINT "restaurant_earnings_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants (FINANCIAL_SPEC §52–53): amounts are exact, non-negative where they must
-- be, and derived totals always equal their components.
ALTER TABLE "restaurant_earnings"
  ADD CONSTRAINT "restaurant_earnings_amounts_check" CHECK (
    "gross_amount" >= 0 AND "commission_amount" >= 0 AND "fee_amount" >= 0
    AND "refund_amount" >= 0 AND "commission_percent" BETWEEN 0 AND 100
    AND "net_amount" = "gross_amount" - "commission_amount" - "fee_amount" - "refund_amount"
  );

ALTER TABLE "rider_earnings"
  ADD CONSTRAINT "rider_earnings_amounts_check" CHECK (
    "base_amount" >= 0 AND "bonus_amount" >= 0
    AND "total_amount" = "base_amount" + "bonus_amount" + "adjustment_amount"
    AND "total_amount" >= 0
  );

ALTER TABLE "financial_adjustments"
  ADD CONSTRAINT "financial_adjustments_amount_check" CHECK ("amount" <> 0);

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_amounts_check" CHECK (
    "gross_amount" >= 0 AND "fees" >= 0 AND "net_amount" > 0
    AND "net_amount" = "gross_amount" - "fees" + "adjustments"
    AND "period_end" > "period_start"
  );

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_check" CHECK ("amount" > 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_check" CHECK ("amount" > 0);

-- A settlement is never paid twice: at most one payout attempt that has not FAILED (§37).
CREATE UNIQUE INDEX "payouts_one_live_per_settlement"
  ON "payouts" ("settlement_id") WHERE "status" <> 'FAILED';

-- Settlement items and issued invoices are immutable (FINANCIAL_SPEC §30, §46).
CREATE FUNCTION "reject_financial_record_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "settlement_items_append_only"
  BEFORE UPDATE OR DELETE ON "settlement_items"
  FOR EACH ROW EXECUTE FUNCTION "reject_financial_record_change"();

CREATE TRIGGER "invoices_append_only"
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION "reject_financial_record_change"();
