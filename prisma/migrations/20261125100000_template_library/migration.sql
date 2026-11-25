-- Thư viện mẫu tin: danh mục + mẫu tham khảo do ADMIN quản lý (không liên kết Template).
CREATE TABLE "TemplateLibraryCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateLibraryCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TemplateLibraryItem" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "TemplateType" NOT NULL DEFAULT 'TEXT',
  "title" TEXT,
  "content" TEXT,
  "secondaryContent" TEXT,
  "content2" TEXT,
  "secondaryContent2" TEXT,
  "otpExpiryMinutes" INTEGER,
  "placeholdersJson" JSONB,
  "placeholder_labels" JSONB,
  "placeholderOrder" JSONB,
  "ctaButtons" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemplateLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TemplateLibraryCategory_name_key" ON "TemplateLibraryCategory"("name");
CREATE INDEX "TemplateLibraryCategory_sortOrder_idx" ON "TemplateLibraryCategory"("sortOrder");
CREATE INDEX "TemplateLibraryItem_categoryId_idx" ON "TemplateLibraryItem"("categoryId");
CREATE INDEX "TemplateLibraryItem_type_idx" ON "TemplateLibraryItem"("type");
CREATE INDEX "TemplateLibraryItem_createdAt_idx" ON "TemplateLibraryItem"("createdAt");

ALTER TABLE "TemplateLibraryItem"
  ADD CONSTRAINT "TemplateLibraryItem_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "TemplateLibraryCategory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
