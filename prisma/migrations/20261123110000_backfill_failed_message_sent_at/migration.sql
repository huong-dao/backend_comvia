-- Failed sends used to be stored without a send time (sentAt NULL), so they
-- sorted first in the log list and were invisible to period analytics.
-- Failures are now written with the attempt time; backfill the existing ones
-- from createdAt (the moment the failed attempt was recorded).
UPDATE "MessageLog"
SET "sentAt" = "createdAt"
WHERE "status" = 'FAILED' AND "sentAt" IS NULL;
