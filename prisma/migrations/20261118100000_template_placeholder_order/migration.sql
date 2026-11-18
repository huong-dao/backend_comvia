-- Ordered placeholder slugs. NULL on existing templates: clients fall back to
-- the key order of placeholdersJson.
ALTER TABLE "Template" ADD COLUMN "placeholderOrder" JSONB;
