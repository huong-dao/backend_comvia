ALTER TABLE "SystemConfig" ADD COLUMN "ctaPricingJson" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "TemplateCtaButton" ADD COLUMN "defaultUnitPrice" INTEGER;

UPDATE "TemplateCtaButton"
SET "defaultUnitPrice" = "unitPrice"
WHERE "defaultUnitPrice" IS NULL;
