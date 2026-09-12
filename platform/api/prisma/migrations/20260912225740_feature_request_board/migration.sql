-- CreateTable
CREATE TABLE "feature_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_request_votes" (
    "id" TEXT NOT NULL,
    "featureRequestId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_request_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_requests_tenantId_idx" ON "feature_requests"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_request_votes_featureRequestId_tenantId_key" ON "feature_request_votes"("featureRequestId", "tenantId");

-- AddForeignKey
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_request_votes" ADD CONSTRAINT "feature_request_votes_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "feature_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_request_votes" ADD CONSTRAINT "feature_request_votes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
