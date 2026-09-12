-- CreateTable
CREATE TABLE "job_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "customerId" TEXT,
    "jobTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assignedTo" TEXT,
    "receivedDate" TIMESTAMPTZ(3) NOT NULL,
    "requiredBy" TIMESTAMPTZ(3),
    "notes" TEXT,
    "terms" TEXT,
    "receivedBy" TEXT,
    "quoteId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipmentMake" TEXT,
    "equipmentModel" TEXT,
    "equipmentSerial" TEXT,
    "reportedFault" TEXT,
    "receivedWithPowerCord" BOOLEAN NOT NULL DEFAULT false,
    "receivedWithFilament" BOOLEAN NOT NULL DEFAULT false,
    "receivedWithBuildPlate" BOOLEAN NOT NULL DEFAULT false,
    "receivedWithSdCard" BOOLEAN NOT NULL DEFAULT false,
    "receivedWithTools" BOOLEAN NOT NULL DEFAULT false,
    "receivedWithOther" TEXT,
    "conditionPrintHead" TEXT,
    "conditionPrintBed" TEXT,
    "conditionExistingDamage" TEXT,
    "technicianFindings" TEXT,
    "printFileName" TEXT,
    "printQuantity" INTEGER,
    "printWhatIsPrinted" TEXT,
    "printProcess" TEXT,
    "printMaterial" TEXT,
    "printColour" TEXT,
    "printQuality" TEXT,
    "finishRemoveSupports" BOOLEAN NOT NULL DEFAULT false,
    "finishDeburrClean" BOOLEAN NOT NULL DEFAULT false,
    "finishSand" BOOLEAN NOT NULL DEFAULT false,
    "finishPrime" BOOLEAN NOT NULL DEFAULT false,
    "finishPaint" BOOLEAN NOT NULL DEFAULT false,
    "finishPostCure" BOOLEAN NOT NULL DEFAULT false,
    "finishInstallInserts" BOOLEAN NOT NULL DEFAULT false,
    "finishAssemble" BOOLEAN NOT NULL DEFAULT false,
    "resultQuantityAccepted" INTEGER,
    "resultQuantityRejected" INTEGER,
    "resultNotes" TEXT,
    "cadDesignType" TEXT,
    "cadWhatModelMustDo" TEXT,
    "cadMaterial" TEXT,
    "cadIntendedProcess" TEXT,
    "cadTolerances" TEXT,
    "cadCriticalDimensions" TEXT,
    "deliverableNativeCad" BOOLEAN NOT NULL DEFAULT false,
    "deliverableStep" BOOLEAN NOT NULL DEFAULT false,
    "deliverableStl" BOOLEAN NOT NULL DEFAULT false,
    "deliverable3mf" BOOLEAN NOT NULL DEFAULT false,
    "deliverableDxf" BOOLEAN NOT NULL DEFAULT false,
    "deliverableDrawingPdf" BOOLEAN NOT NULL DEFAULT false,
    "deliverableRenderedImages" BOOLEAN NOT NULL DEFAULT false,
    "cadApprovedRevision" TEXT,

    CONSTRAINT "job_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_quoteId_key" ON "job_cards"("quoteId");

-- CreateIndex
CREATE INDEX "job_cards_tenantId_idx" ON "job_cards"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_tenantId_number_key" ON "job_cards"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
