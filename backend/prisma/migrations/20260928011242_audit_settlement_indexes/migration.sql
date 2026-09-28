-- Audit: settlement lookups (payout completion, settlement detail) filter these tables by
-- settlement_id; PostgreSQL does not index foreign keys automatically.

-- CreateIndex
CREATE INDEX "financial_adjustments_settlement_id_idx" ON "financial_adjustments"("settlement_id");

-- CreateIndex
CREATE INDEX "payouts_settlement_id_idx" ON "payouts"("settlement_id");

-- CreateIndex
CREATE INDEX "restaurant_earnings_settlement_id_idx" ON "restaurant_earnings"("settlement_id");

-- CreateIndex
CREATE INDEX "rider_earnings_settlement_id_idx" ON "rider_earnings"("settlement_id");
