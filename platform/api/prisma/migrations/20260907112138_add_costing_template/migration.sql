-- CreateTable
CREATE TABLE "costing_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filamentId" TEXT,
    "filamentSnapshotBrand" TEXT,
    "filamentSnapshotMaterialType" TEXT,
    "filamentSnapshotCostPerGram" DECIMAL(12,6),
    "weightGrams" DOUBLE PRECISION NOT NULL,
    "printerId" TEXT,
    "printerSnapshotName" TEXT,
    "printerSnapshotElectricityRatePerKwh" DECIMAL(10,4),
    "printerSnapshotDepreciationPerHour" DECIMAL(12,4),
    "printTimeHours" DOUBLE PRECISION NOT NULL,
    "markupPercent" DECIMAL(6,2) NOT NULL,
    "filamentCost" DECIMAL(12,2) NOT NULL,
    "electricityCost" DECIMAL(12,2) NOT NULL,
    "depreciationCost" DECIMAL(12,2) NOT NULL,
    "labourCost" DECIMAL(12,2) NOT NULL,
    "consumablesCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "suggestedPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costing_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_labour_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingTemplateId" TEXT NOT NULL,
    "labourStepId" TEXT,
    "labourStepSnapshotName" TEXT NOT NULL,
    "hourlyRateSnapshot" DECIMAL(10,2) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "lineCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "costing_labour_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "costing_consumable_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "costingTemplateId" TEXT NOT NULL,
    "consumableId" TEXT,
    "consumableSnapshotName" TEXT NOT NULL,
    "costPerUnitSnapshot" DECIMAL(10,2) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "lineCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "costing_consumable_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "costing_templates_tenantId_idx" ON "costing_templates"("tenantId");

-- CreateIndex
CREATE INDEX "costing_labour_lines_tenantId_idx" ON "costing_labour_lines"("tenantId");

-- CreateIndex
CREATE INDEX "costing_labour_lines_costingTemplateId_idx" ON "costing_labour_lines"("costingTemplateId");

-- CreateIndex
CREATE INDEX "costing_consumable_lines_tenantId_idx" ON "costing_consumable_lines"("tenantId");

-- CreateIndex
CREATE INDEX "costing_consumable_lines_costingTemplateId_idx" ON "costing_consumable_lines"("costingTemplateId");

-- AddForeignKey
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "filaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_labour_lines" ADD CONSTRAINT "costing_labour_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_labour_lines" ADD CONSTRAINT "costing_labour_lines_costingTemplateId_fkey" FOREIGN KEY ("costingTemplateId") REFERENCES "costing_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_labour_lines" ADD CONSTRAINT "costing_labour_lines_labourStepId_fkey" FOREIGN KEY ("labourStepId") REFERENCES "labour_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_consumable_lines" ADD CONSTRAINT "costing_consumable_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_consumable_lines" ADD CONSTRAINT "costing_consumable_lines_costingTemplateId_fkey" FOREIGN KEY ("costingTemplateId") REFERENCES "costing_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "costing_consumable_lines" ADD CONSTRAINT "costing_consumable_lines_consumableId_fkey" FOREIGN KEY ("consumableId") REFERENCES "consumables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
