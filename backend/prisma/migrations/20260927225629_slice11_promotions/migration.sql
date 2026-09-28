-- CreateEnum
CREATE TYPE "promotion_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "promotion_status" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'DISABLED');

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT NOT NULL,
    "type" "promotion_type" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "minimum_order_amount" DECIMAL(12,2),
    "maximum_discount_amount" DECIMAL(12,2),
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "per_customer_usage_limit" INTEGER,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "promotion_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_usages" (
    "id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotions_status_ends_at_idx" ON "promotions"("status", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_restaurant_id_code_key" ON "promotions"("restaurant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_usages_order_id_key" ON "promotion_usages"("order_id");

-- CreateIndex
CREATE INDEX "promotion_usages_promotion_id_customer_id_idx" ON "promotion_usages"("promotion_id", "customer_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PROMOTION_RULES §17–19, §26–27 and DATABASE.md §72.
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_value_valid" CHECK (
  "value" > 0 AND ("type" <> 'PERCENTAGE' OR "value" <= 100)
);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_amounts_valid" CHECK (
  ("minimum_order_amount" IS NULL OR "minimum_order_amount" >= 0)
  AND ("maximum_discount_amount" IS NULL OR "maximum_discount_amount" > 0)
);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_usage_valid" CHECK (
  "usage_count" >= 0
  AND ("usage_limit" IS NULL OR ("usage_limit" > 0 AND "usage_count" <= "usage_limit"))
  AND ("per_customer_usage_limit" IS NULL OR "per_customer_usage_limit" > 0)
);
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_window_valid" CHECK ("ends_at" > "starts_at");
ALTER TABLE "promotion_usages" ADD CONSTRAINT "promotion_usages_discount_positive" CHECK ("discount_amount" > 0);
