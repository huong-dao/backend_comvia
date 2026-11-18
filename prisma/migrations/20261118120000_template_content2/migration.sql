-- Extra content blocks. NULL on existing templates.
ALTER TABLE "Template" ADD COLUMN "content2" TEXT,
ADD COLUMN "secondaryContent2" TEXT;
