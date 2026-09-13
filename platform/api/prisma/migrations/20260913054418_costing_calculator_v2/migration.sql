-- AlterTable
ALTER TABLE "costing_templates" ADD COLUMN     "laserMaterialId" TEXT,
ADD COLUMN     "laserMaterialSnapshotName" TEXT,
ADD COLUMN     "premadeItemId" TEXT,
ADD COLUMN     "premadeItemQuantity" INTEGER,
ADD COLUMN     "premadeItemSnapshotName" TEXT,
ADD COLUMN     "process" TEXT NOT NULL DEFAULT 'printer',
ADD COLUMN     "scanHours" DOUBLE PRECISION,
ADD COLUMN     "scannerId" TEXT,
ADD COLUMN     "scannerSnapshotName" TEXT,
ADD COLUMN     "sheetAreaUsedM2" DOUBLE PRECISION,
ALTER COLUMN "weightGrams" DROP NOT NULL,
ALTER COLUMN "printTimeHours" DROP NOT NULL;

-- AlterTable
ALTER TABLE "printers" ADD COLUMN     "process" TEXT NOT NULL DEFAULT 'fdm';

-- CreateTable
CREATE TABLE "scanners" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scannerCost" DOUBLE PRECISION NOT NULL,
    "expectedScanHours" DOUBLE PRECISION NOT NULL,
    "powerCostPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laser_materials" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheetPrice" DOUBLE PRECISION NOT NULL,
    "sheetAreaM2" DOUBLE PRECISION NOT NULL,
    "usableSheetAreaM2" DOUBLE PRECISION NOT NULL,
    "costMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "laser_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premade_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "costMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premade_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "cost" DECIMAL(12,2) NOT NULL,
    "sellingPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scanners_tenantId_idx" ON "scanners"("tenantId");

-- CreateIndex
CREATE INDEX "laser_materials_tenantId_idx" ON "laser_materials"("tenantId");

-- CreateIndex
CREATE INDEX "premade_items_tenantId_idx" ON "premade_items"("tenantId");

-- CreateIndex
CREATE INDEX "products_tenantId_idx" ON "products"("tenantId");

-- AddForeignKey
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "scanners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_laserMaterialId_fkey" FOREIGN KEY ("laserMaterialId") REFERENCES "laser_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_premadeItemId_fkey" FOREIGN KEY ("premadeItemId") REFERENCES "premade_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scanners" ADD CONSTRAINT "scanners_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laser_materials" ADD CONSTRAINT "laser_materials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premade_items" ADD CONSTRAINT "premade_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
