-- CreateTable
CREATE TABLE "printer_presets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "nozzleTempC" DOUBLE PRECISION,
    "bedTempC" DOUBLE PRECISION,
    "printSpeedMmS" DOUBLE PRECISION,
    "layerHeightMm" DOUBLE PRECISION,
    "infillPercent" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "printer_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printer_presets_tenantId_idx" ON "printer_presets"("tenantId");

-- CreateIndex
CREATE INDEX "printer_presets_printerId_idx" ON "printer_presets"("printerId");

-- AddForeignKey
ALTER TABLE "printer_presets" ADD CONSTRAINT "printer_presets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_presets" ADD CONSTRAINT "printer_presets_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
