-- CTA buttons belong to a template. Existing templates intentionally receive no rows.
CREATE TYPE "TemplateCtaType" AS ENUM (
  'OA_PROFILE',
  'ZALO_MINI_APP',
  'OA_ARTICLE',
  'BUSINESS_WEBSITE',
  'PHONE_CALL',
  'EXTERNAL_WEB_OR_MINI_APP',
  'APP_DOWNLOAD',
  'DISTRIBUTION_PAGE',
  'EXTERNAL_APP'
);

CREATE TABLE "TemplateCtaButton" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "type" "TemplateCtaType" NOT NULL,
  "label" TEXT,
  "target" TEXT,
  "unitPrice" INTEGER,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateCtaButton_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateCtaButton_templateId_position_key"
  ON "TemplateCtaButton"("templateId", "position");
CREATE INDEX "TemplateCtaButton_templateId_idx" ON "TemplateCtaButton"("templateId");
ALTER TABLE "TemplateCtaButton"
  ADD CONSTRAINT "TemplateCtaButton_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "Template"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
