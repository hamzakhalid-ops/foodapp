-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('PENDING', 'ASSIGNED', 'ARRIVING_AT_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "dispatch_offer_status" AS ENUM ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rider_id" UUID,
    "status" "delivery_status" NOT NULL DEFAULT 'PENDING',
    "pickup_at" TIMESTAMPTZ(6),
    "picked_up_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "delivery_notes" TEXT,
    "dispatch_failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_offers" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "status" "dispatch_offer_status" NOT NULL DEFAULT 'OFFERED',
    "offered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "distance_to_restaurant" DECIMAL(8,3) NOT NULL,
    "estimated_arrival_seconds" INTEGER,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dispatch_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_assignments" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_settings" (
    "id" UUID NOT NULL,
    "initial_radius" DECIMAL(6,2) NOT NULL,
    "radius_increment" DECIMAL(6,2) NOT NULL,
    "maximum_radius" DECIMAL(6,2) NOT NULL,
    "offer_timeout_seconds" INTEGER NOT NULL,
    "max_offer_attempts" INTEGER NOT NULL,
    "location_max_age_seconds" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "dispatch_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_order_id_key" ON "deliveries"("order_id");

-- CreateIndex
CREATE INDEX "deliveries_rider_id_status_idx" ON "deliveries"("rider_id", "status");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");

-- CreateIndex
CREATE INDEX "dispatch_offers_order_id_idx" ON "dispatch_offers"("order_id");

-- CreateIndex
CREATE INDEX "dispatch_offers_rider_id_status_idx" ON "dispatch_offers"("rider_id", "status");

-- CreateIndex
CREATE INDEX "dispatch_offers_status_expires_at_idx" ON "dispatch_offers"("status", "expires_at");

-- CreateIndex
CREATE INDEX "delivery_assignments_delivery_id_idx" ON "delivery_assignments"("delivery_id");

-- CreateIndex
CREATE INDEX "delivery_assignments_rider_id_idx" ON "delivery_assignments"("rider_id");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_offers" ADD CONSTRAINT "dispatch_offers_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_assignments" ADD CONSTRAINT "delivery_assignments_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- V1: one active delivery per rider (DISPATCH_RULES §9) and one open offer per order and per rider.
CREATE UNIQUE INDEX "deliveries_one_active_per_rider" ON "deliveries"("rider_id")
  WHERE "status" IN ('ASSIGNED', 'ARRIVING_AT_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY');
CREATE UNIQUE INDEX "dispatch_offers_one_open_per_order" ON "dispatch_offers"("order_id") WHERE "status" = 'OFFERED';
CREATE UNIQUE INDEX "dispatch_offers_one_open_per_rider" ON "dispatch_offers"("rider_id") WHERE "status" = 'OFFERED';
CREATE UNIQUE INDEX "delivery_assignments_one_active" ON "delivery_assignments"("delivery_id") WHERE "unassigned_at" IS NULL;
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_assigned_has_rider" CHECK ("status" IN ('PENDING', 'CANCELLED') OR "rider_id" IS NOT NULL);

-- Dispatch configuration sanity (DATABASE.md §38).
ALTER TABLE "dispatch_settings" ADD CONSTRAINT "dispatch_settings_valid" CHECK (
  "initial_radius" > 0 AND "radius_increment" > 0 AND "maximum_radius" >= "initial_radius"
  AND "offer_timeout_seconds" > 0 AND "max_offer_attempts" > 0 AND "location_max_age_seconds" > 0
);
CREATE UNIQUE INDEX "dispatch_settings_singleton" ON "dispatch_settings"((true));
