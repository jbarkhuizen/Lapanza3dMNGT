-- CreateTable
CREATE TABLE "printer_maintenance_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "performedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "printer_maintenance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "printer_maintenance_logs_tenantId_idx" ON "printer_maintenance_logs"("tenantId");

-- CreateIndex
CREATE INDEX "printer_maintenance_logs_printerId_idx" ON "printer_maintenance_logs"("printerId");

-- AddForeignKey
ALTER TABLE "printer_maintenance_logs" ADD CONSTRAINT "printer_maintenance_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_maintenance_logs" ADD CONSTRAINT "printer_maintenance_logs_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "printers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
