-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" TEXT,
    "recipient_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "area" TEXT,
    "city" TEXT NOT NULL,
    "postal_code" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "delivery_instructions" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DATABASE.md §7: at most one default address per user.
CREATE UNIQUE INDEX "addresses_one_default_per_user" ON "addresses"("user_id") WHERE "is_default";

-- MAPS_LOCATION_RULES §5: coordinates within WGS 84 range.
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_latitude_range" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_longitude_range" CHECK ("longitude" BETWEEN -180 AND 180);
