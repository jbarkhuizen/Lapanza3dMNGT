-- CreateTable
CREATE TABLE "filaments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "materialType" TEXT NOT NULL,
    "colour" TEXT,
    "diameterMm" DOUBLE PRECISION NOT NULL,
    "costPerSpool" DOUBLE PRECISION,
    "costPerKg" DOUBLE PRECISION,
    "spoolWeightGrams" DOUBLE PRECISION,
    "remainingWeightGrams" DOUBLE PRECISION,
    "supplier" TEXT,
    "purchaseDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "lowStockThresholdGrams" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filaments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "filaments_tenantId_idx" ON "filaments"("tenantId");

-- AddForeignKey
ALTER TABLE "filaments" ADD CONSTRAINT "filaments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
