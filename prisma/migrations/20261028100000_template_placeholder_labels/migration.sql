-- Display labels for template placeholders. NULL on existing templates means
-- clients keep showing the placeholder slug.
ALTER TABLE "Template" ADD COLUMN "placeholder_labels" JSONB;
