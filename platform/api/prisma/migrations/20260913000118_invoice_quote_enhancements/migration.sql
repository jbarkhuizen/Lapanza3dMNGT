-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountAppliesTo" TEXT,
ADD COLUMN     "discountPercent" DECIMAL(5,2),
ADD COLUMN     "paymentLinkUrl" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "termsAndConditionsText" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountAppliesTo" TEXT,
ADD COLUMN     "discountPercent" DECIMAL(5,2),
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "termsAndConditionsText" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "defaultNotes" TEXT,
ADD COLUMN     "defaultPaymentTerms" TEXT,
ADD COLUMN     "pricingNotesText" TEXT;
