-- ISSUE-001: bỏ toàn bộ tính năng Invoice. Order/OrderItem giữ nguyên;
-- topup paid chỉ tạo Order, không còn tạo Invoice/InvoiceItem kèm theo.

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_orderId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- DropTable
DROP TABLE "Invoice";

-- DropTable
DROP TABLE "InvoiceItem";

-- DropEnum
DROP TYPE "InvoiceStatus";
