# Component Design — wallet

Module ví credit cấp owner: đọc số dư/thống kê và ghi bút toán bất biến. Mọi biến động số dư đi qua transaction log (`BR-WALLET-04`); không sửa `balance` trực tiếp. Quyết định tách method ledger trung tính cho manual adjustment đọc kèm ADR-004.

## WalletController
**Trách nhiệm:** đọc số dư và liệt kê giao dịch của ví gắn với workspace hiện tại.
**Cấu trúc bên trong:** Controller (`workspaces/:workspaceId/wallet`) → `WalletService` → `PrismaService`. Hai route `GET balance`, `GET transactions`.
**Phụ thuộc:** `WalletService`, `WorkspaceContextGuard` (membership). Không có route mutation ở controller này — điều chỉnh thủ công của ADMIN đặt ở admin module (ADR-004).
**Rule/Requirement liên quan:** BR-WALLET-01, BR-WALLET-02, BR-WALLET-05.

## WalletService
**Trách nhiệm:** đọc số dư lũy kế (`balance`, `totalTopup`, `totalSpent`, `totalRefund`) và tính số liệu theo tháng; liệt kê/lọc `WalletTransaction` theo workspace.
**Cấu trúc bên trong:** Service → `PrismaService`. Aggregate theo tháng lọc theo type cụ thể (`TOPUP_CREDIT` cho "đã nạp"; `MESSAGE_DEBIT` + `CAMPAIGN_HOLD` − `CAMPAIGN_REFUND` cho "đã dùng") và chỉ tính `status = SUCCESS`. `MANUAL_ADJUSTMENT` không nằm trong các tập type này nên không làm nhiễu số liệu theo tháng.
**Phụ thuộc:** `PrismaService`.
**Rule/Requirement liên quan:** BR-WALLET-02, BR-WALLET-05, BR-WALLET-06, BR-MSG-05.

## WalletLedgerService
**Trách nhiệm:** ghi bút toán bất biến và cập nhật `balance` dưới khoá hàng ví, trong một `Prisma.TransactionClient` do caller cung cấp. Là điểm ghi số dư duy nhất của toàn hệ thống (messaging, campaigns, topups, admin đều gọi vào đây).
**Cấu trúc bên trong:** ba method ghi, cùng dùng `lock()` (SELECT ... FOR UPDATE trên `WalletAccount` theo `ownerUserId`) và `ledgerData()` (dựng bản ghi `WalletTransaction` kèm `balanceBefore`/`balanceAfter`):
- `debit(tx, params)` — trừ số dư, tăng `totalSpent`. Reject khi `balance < amount` (không clamp).
- `credit(tx, params, counter)` — cộng số dư, tăng `totalTopup` hoặc `totalRefund`; giảm `totalSpent` khi type là `CAMPAIGN_REFUND`.
- `adjust(tx, params, direction)` — **method cho manual adjustment (ADR-004)**. Ghi bút toán `MANUAL_ADJUSTMENT`, cập nhật **chỉ** `balance`, không chạm bất kỳ counter lũy kế nào. `direction = CREDIT`: `balanceAfter = balance + amount`. `direction = DEBIT`: reject khi `balance < amount` (cùng guard với `debit()`, không clamp), `balanceAfter = balance − amount`. `note` bắt buộc không rỗng được validate ở biên (DTO admin), `createdBy` = ADMIN thực hiện. Trả về `walletTransactionId` để caller ghi audit.

Bất biến: `credit()`/`debit()` luôn khớp đúng một counter lũy kế; `adjust()` là method duy nhất không chạm counter — đây là lý do tách method riêng thay vì nới counter nullable (ADR-004).
**Phụ thuộc:** `Prisma.TransactionClient` (truyền vào từ caller — không tự mở transaction). Không phụ thuộc admin/messaging/campaign module (các module đó phụ thuộc wallet, không ngược lại).
**Rule/Requirement liên quan:** BR-WALLET-03, BR-WALLET-04, BR-WALLET-07.

## Export
`WalletModule` export `WalletService` và `WalletLedgerService`. `adjust()` được `AdminService` gọi qua `WalletLedgerService` (AdminModule import WalletModule — xem admin component-design).
