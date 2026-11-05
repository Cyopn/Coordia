CREATE UNIQUE INDEX "Membership_organizationId_id_key" ON "Membership"("organizationId", "id");

ALTER TABLE "WorkCapacityAdjustment"
  DROP CONSTRAINT "WorkCapacityAdjustment_membershipId_fkey";

ALTER TABLE "WorkCapacityAdjustment"
  ADD CONSTRAINT "WorkCapacityAdjustment_organizationId_membershipId_fkey"
  FOREIGN KEY ("organizationId", "membershipId")
  REFERENCES "Membership"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkAbsence"
  DROP CONSTRAINT "WorkAbsence_membershipId_fkey";

ALTER TABLE "WorkAbsence"
  ADD CONSTRAINT "WorkAbsence_organizationId_membershipId_fkey"
  FOREIGN KEY ("organizationId", "membershipId")
  REFERENCES "Membership"("organizationId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
