-- CreateTable
CREATE TABLE "consumables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "costPerUnit" DOUBLE PRECISION NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reorderThreshold" DOUBLE PRECISION,
    "supplier" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consumables_tenantId_idx" ON "consumables"("tenantId");

-- AddForeignKey
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
