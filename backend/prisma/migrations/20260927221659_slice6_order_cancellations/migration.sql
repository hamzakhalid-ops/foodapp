-- CreateTable
CREATE TABLE "order_cancellations" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "cancelled_by_user_id" UUID NOT NULL,
    "cancelled_by_role" "role" NOT NULL,
    "reason_code" TEXT NOT NULL,
    "reason_text" TEXT,
    "refund_amount" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_cancellations_order_id_key" ON "order_cancellations"("order_id");

-- AddForeignKey
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Refund amounts are never negative (DATABASE.md §72).
ALTER TABLE "order_cancellations" ADD CONSTRAINT "order_cancellations_refund_non_negative" CHECK ("refund_amount" IS NULL OR "refund_amount" >= 0);
