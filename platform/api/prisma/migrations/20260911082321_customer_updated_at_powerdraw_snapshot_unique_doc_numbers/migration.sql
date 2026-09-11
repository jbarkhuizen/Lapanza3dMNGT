-- AlterTable
ALTER TABLE "costing_templates" ADD COLUMN     "printerSnapshotPowerDrawWatts" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_number_key" ON "invoices"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenantId_number_key" ON "quotes"("tenantId", "number");

