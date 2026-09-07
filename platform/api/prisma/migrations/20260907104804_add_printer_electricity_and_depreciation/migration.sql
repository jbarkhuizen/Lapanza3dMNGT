-- AlterTable
ALTER TABLE "printers" ADD COLUMN     "electricityRatePerKwh" DECIMAL(10,4),
ADD COLUMN     "expectedLifetimeHours" DOUBLE PRECISION;
