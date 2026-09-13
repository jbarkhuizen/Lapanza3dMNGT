-- AlterTable
ALTER TABLE "costing_templates" ADD COLUMN     "sliceJobId" TEXT;

-- AlterTable
ALTER TABLE "job_cards" ADD COLUMN     "sliceFilamentLengthMm" DOUBLE PRECISION,
ADD COLUMN     "sliceJobId" TEXT,
ADD COLUMN     "slicePrintTimeHours" DOUBLE PRECISION,
ADD COLUMN     "sliceSupportWeightGrams" DOUBLE PRECISION,
ADD COLUMN     "sliceWeightGrams" DOUBLE PRECISION,
ADD COLUMN     "stlFileName" TEXT;

-- AlterTable
ALTER TABLE "printers" ADD COLUMN     "nozzleDiameterMm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "slice_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "originFileName" TEXT NOT NULL,
    "printerId" TEXT,
    "printerPresetId" TEXT,
    "filamentId" TEXT,
    "resultWeightGrams" DOUBLE PRECISION,
    "resultSupportWeightGrams" DOUBLE PRECISION,
    "resultFilamentLengthMm" DOUBLE PRECISION,
    "resultPrintTimeHours" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "slice_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "slice_jobs_tenantId_idx" ON "slice_jobs"("tenantId");

-- CreateIndex
CREATE INDEX "slice_jobs_status_idx" ON "slice_jobs"("status");

-- AddForeignKey
ALTER TABLE "costing_templates" ADD CONSTRAINT "costing_templates_sliceJobId_fkey" FOREIGN KEY ("sliceJobId") REFERENCES "slice_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slice_jobs" ADD CONSTRAINT "slice_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slice_jobs" ADD CONSTRAINT "slice_jobs_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slice_jobs" ADD CONSTRAINT "slice_jobs_printerPresetId_fkey" FOREIGN KEY ("printerPresetId") REFERENCES "printer_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slice_jobs" ADD CONSTRAINT "slice_jobs_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "filaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
