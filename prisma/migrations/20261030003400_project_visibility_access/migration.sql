CREATE TYPE "ProjectVisibility" AS ENUM ('ORGANIZATION', 'PRIVATE');

ALTER TABLE "Project"
ADD COLUMN "visibility" "ProjectVisibility" NOT NULL DEFAULT 'ORGANIZATION';

CREATE TABLE "ProjectAccess" (
  "projectId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("projectId", "membershipId"),
  CONSTRAINT "ProjectAccess_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectAccess_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProjectAccess_membershipId_idx" ON "ProjectAccess"("membershipId");
