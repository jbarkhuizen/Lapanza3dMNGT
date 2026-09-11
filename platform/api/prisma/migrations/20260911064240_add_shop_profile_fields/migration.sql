-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "shopContactWhatsapp" TEXT,
ADD COLUMN     "shopGalleryUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "shopHoursText" TEXT,
ADD COLUMN     "shopIsPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shopServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "shopSlug" TEXT,
ADD COLUMN     "shopTagline" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_shopSlug_key" ON "tenants"("shopSlug");

