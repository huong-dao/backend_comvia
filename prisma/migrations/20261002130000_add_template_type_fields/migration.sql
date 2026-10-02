-- Add template content-structure type + related fields (ISSUE-004, BR-TPL-01).
-- All additions are additive and non-breaking: new enum column has a default,
-- the other new columns are nullable, and content/placeholdersJson are relaxed
-- to nullable so OTP templates can omit them. No FK touched, no data re-map.

-- ---------------------------------------------------------------------------
-- Step 1: TemplateType enum.
-- ---------------------------------------------------------------------------
CREATE TYPE "TemplateType" AS ENUM ('TEXT', 'TABLE', 'OTP');

-- ---------------------------------------------------------------------------
-- Step 2: New columns on Template.
-- "type" has DEFAULT 'TEXT' so every existing row is migrated to TEXT
-- (the pre-existing templates are all free-text with content + placeholders).
-- ---------------------------------------------------------------------------
ALTER TABLE "Template" ADD COLUMN "type" "TemplateType" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "Template" ADD COLUMN "title" TEXT;
ALTER TABLE "Template" ADD COLUMN "trackingId" TEXT;
ALTER TABLE "Template" ADD COLUMN "secondaryContent" TEXT;
ALTER TABLE "Template" ADD COLUMN "otpExpiryMinutes" INTEGER;

-- ---------------------------------------------------------------------------
-- Step 3: Relax content / placeholdersJson to nullable (OTP templates omit them).
-- Existing rows keep their non-null values; validation of "required for TEXT/TABLE"
-- lives in the service layer, not the DB column.
-- ---------------------------------------------------------------------------
ALTER TABLE "Template" ALTER COLUMN "content" DROP NOT NULL;
ALTER TABLE "Template" ALTER COLUMN "placeholdersJson" DROP NOT NULL;
