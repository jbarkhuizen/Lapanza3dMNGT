-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trialEndingInApp" BOOLEAN NOT NULL DEFAULT true,
    "trialEndingEmail" BOOLEAN NOT NULL DEFAULT true,
    "lowStockInApp" BOOLEAN NOT NULL DEFAULT true,
    "lowStockEmail" BOOLEAN NOT NULL DEFAULT true,
    "invoiceOverdueInApp" BOOLEAN NOT NULL DEFAULT true,
    "invoiceOverdueEmail" BOOLEAN NOT NULL DEFAULT true,
    "paymentReceiptInApp" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionCancelledInApp" BOOLEAN NOT NULL DEFAULT true,
    "paymentFailedInApp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_tenantId_key" ON "notification_preferences"("tenantId");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
