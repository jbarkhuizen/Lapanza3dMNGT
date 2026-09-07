-- CreateTable
CREATE TABLE "labour_steps" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hourlyRate" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labour_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labour_steps_tenantId_idx" ON "labour_steps"("tenantId");

-- AddForeignKey
ALTER TABLE "labour_steps" ADD CONSTRAINT "labour_steps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
