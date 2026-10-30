ALTER TABLE "User" ADD COLUMN "isGlobalAdmin" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "GlobalAdminBootstrap" (
    "id" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "initializedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GlobalAdminBootstrap_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GlobalAdminBootstrap" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP);
CREATE INDEX "User_isGlobalAdmin_idx" ON "User"("isGlobalAdmin");
