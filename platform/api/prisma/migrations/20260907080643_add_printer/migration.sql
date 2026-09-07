-- CreateTable
CREATE TABLE "printers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "buildVolumeXMm" DOUBLE PRECISION,
    "buildVolumeYMm" DOUBLE PRECISION,
    "buildVolumeZMm" DOUBLE PRECISION,
    "purchaseDate" TIMESTAMPTZ(3),
    "purchaseCost" DOUBLE PRECISION,
    "powerDrawWatts" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "printers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printers_tenantId_idx" ON "printers"("tenantId");

-- AddForeignKey
ALTER TABLE "printers" ADD CONSTRAINT "printers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
