-- CreateEnum
CREATE TYPE "restaurant_status" AS ENUM ('OFFLINE', 'ONLINE', 'TEMPORARILY_PAUSED', 'CLOSED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "restaurant_approval_status" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED');

-- CreateEnum
CREATE TYPE "restaurant_staff_role" AS ENUM ('OWNER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "restaurant_staff_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "payment_account_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "restaurant_owner_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_owner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "cover_image_url" TEXT,
    "status" "restaurant_status" NOT NULL DEFAULT 'OFFLINE',
    "approval_status" "restaurant_approval_status" NOT NULL DEFAULT 'DRAFT',
    "paused_until" TIMESTAMPTZ(6),
    "status_reason" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "address_line_1" TEXT,
    "address_line_2" TEXT,
    "area" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "cuisine_description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_applications" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "status" "restaurant_approval_status" NOT NULL DEFAULT 'DRAFT',
    "business_information" JSONB,
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "rejection_reason" TEXT,
    "resubmission_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_staff" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "restaurant_staff_role" NOT NULL,
    "status" "restaurant_staff_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_documents" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'PENDING',
    "uploaded_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_operating_hours" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "opens_at" CHAR(5),
    "closes_at" CHAR(5),
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_delivery_settings" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "minimum_order_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimated_preparation_minutes" INTEGER NOT NULL,
    "delivery_radius" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_delivery_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_payment_accounts" (
    "id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "status" "payment_account_status" NOT NULL DEFAULT 'ACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "restaurant_payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_owner_profiles_user_id_key" ON "restaurant_owner_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "restaurants_status_idx" ON "restaurants"("status");

-- CreateIndex
CREATE INDEX "restaurants_approval_status_idx" ON "restaurants"("approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_applications_restaurant_id_key" ON "restaurant_applications"("restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_applications_status_idx" ON "restaurant_applications"("status");

-- CreateIndex
CREATE INDEX "restaurant_staff_user_id_idx" ON "restaurant_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_staff_restaurant_id_user_id_key" ON "restaurant_staff"("restaurant_id", "user_id");

-- CreateIndex
CREATE INDEX "restaurant_documents_restaurant_id_idx" ON "restaurant_documents"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_operating_hours_restaurant_id_day_of_week_key" ON "restaurant_operating_hours"("restaurant_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_delivery_settings_restaurant_id_key" ON "restaurant_delivery_settings"("restaurant_id");

-- CreateIndex
CREATE INDEX "restaurant_payment_accounts_restaurant_id_idx" ON "restaurant_payment_accounts"("restaurant_id");

-- AddForeignKey
ALTER TABLE "restaurant_owner_profiles" ADD CONSTRAINT "restaurant_owner_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_applications" ADD CONSTRAINT "restaurant_applications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_applications" ADD CONSTRAINT "restaurant_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_staff" ADD CONSTRAINT "restaurant_staff_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_staff" ADD CONSTRAINT "restaurant_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_documents" ADD CONSTRAINT "restaurant_documents_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_documents" ADD CONSTRAINT "restaurant_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_documents" ADD CONSTRAINT "restaurant_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_operating_hours" ADD CONSTRAINT "restaurant_operating_hours_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_delivery_settings" ADD CONSTRAINT "restaurant_delivery_settings_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_payment_accounts" ADD CONSTRAINT "restaurant_payment_accounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- V1: a user belongs to at most one restaurant (API_SPEC §45–57 routes are implicit per user).
CREATE UNIQUE INDEX "restaurant_staff_one_active_membership" ON "restaurant_staff"("user_id") WHERE "status" = 'ACTIVE';
-- One default payment account per restaurant.
CREATE UNIQUE INDEX "restaurant_payment_accounts_one_default" ON "restaurant_payment_accounts"("restaurant_id") WHERE "is_default";

ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);
ALTER TABLE "restaurant_operating_hours" ADD CONSTRAINT "operating_hours_day_range" CHECK ("day_of_week" BETWEEN 1 AND 7);
ALTER TABLE "restaurant_operating_hours" ADD CONSTRAINT "operating_hours_open_before_close"
  CHECK ("is_closed" OR ("opens_at" IS NOT NULL AND "closes_at" IS NOT NULL AND "opens_at" < "closes_at"));
ALTER TABLE "restaurant_delivery_settings" ADD CONSTRAINT "delivery_settings_non_negative"
  CHECK ("minimum_order_amount" >= 0 AND "delivery_radius" > 0 AND "estimated_preparation_minutes" > 0);
