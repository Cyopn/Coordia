-- This is an empty migration.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "WorkAbsence"
  ADD CONSTRAINT "WorkAbsence_valid_interval_check"
  CHECK ("endsAt" >= "startsAt");

ALTER TABLE "WorkAbsence"
  ADD CONSTRAINT "WorkAbsence_no_overlapping_dates"
  EXCLUDE USING gist (
    "organizationId" WITH =,
    "membershipId" WITH =,
    (daterange("startsAt", "endsAt", '[]')) WITH &&
  );