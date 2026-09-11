-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chemistry" TEXT NOT NULL,
    "bestFor" TEXT NOT NULL,
    "nozzleTempC" INTEGER NOT NULL,
    "bedTempC" INTEGER NOT NULL,
    "requiresEnclosure" BOOLEAN NOT NULL DEFAULT false,
    "requiresHardenedNozzle" BOOLEAN NOT NULL DEFAULT false,
    "requiresDirectDrive" BOOLEAN NOT NULL DEFAULT false,
    "recommendsDryFilament" BOOLEAN NOT NULL DEFAULT false,
    "recommendsVentilation" BOOLEAN NOT NULL DEFAULT false,
    "difficulty" TEXT NOT NULL,
    "moisture" TEXT NOT NULL,
    "abrasive" BOOLEAN NOT NULL DEFAULT false,
    "priceZarPerKgLow" DOUBLE PRECISION NOT NULL,
    "priceZarPerKgHigh" DOUBLE PRECISION NOT NULL,
    "priceEstimated" BOOLEAN NOT NULL DEFAULT false,
    "whyChooseIt" TEXT NOT NULL,
    "avoidWhenText" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);
