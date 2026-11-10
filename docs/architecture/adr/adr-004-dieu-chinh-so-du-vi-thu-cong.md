# ADR-004: Điều chỉnh số dư ví thủ công bởi Admin — method ledger trung tính và vị trí endpoint

**Trạng thái:** Proposed
**Ngày:** 2026-11-10

## Bối cảnh

`BR-WALLET-07` (và `BR-ADMIN-02` cập nhật) yêu cầu user role hệ thống `ADMIN` điều chỉnh số dư ví của owner một workspace (cộng hoặc trừ) không qua luồng topup/thanh toán. Ràng buộc nghiệp vụ đã chốt: không cộng vào `totalTopup`, không tính doanh thu/VAT (`BR-ADMIN-05`), trừ quá số dư thì reject, `note` bắt buộc, mỗi lần sinh đúng một bút toán `MANUAL_ADJUSTMENT` qua transaction log.

`WalletLedgerService` hiện có hai method, mỗi method **bắt buộc** chạm một counter lũy kế trên `WalletAccount`:
- `debit()` tăng `totalSpent` (`src/wallet/wallet-ledger.service.ts:41-47`).
- `credit(counter)` tăng `totalTopup` hoặc `totalRefund`, và giảm `totalSpent` nếu type là `CAMPAIGN_REFUND` (`:67-76`).

Manual adjustment không phải chi tiêu (không phải `totalSpent`) cũng không phải nạp/hoàn (không phải `totalTopup`/`totalRefund`). Dùng lại `debit()`/`credit()` sẽ làm sai các counter lũy kế hiển thị ở `BR-WALLET-02`. Aggregate theo tháng (`BR-WALLET-05`, `src/wallet/wallet.service.ts:156-181`) đã lọc theo type cụ thể (`TOPUP_CREDIT`, `MESSAGE_DEBIT`, `CAMPAIGN_HOLD`, `CAMPAIGN_REFUND`) nên không bị `MANUAL_ADJUSTMENT` làm nhiễu; chỉ các counter lũy kế là điểm rủi ro.

Endpoint quản trị gated `@Roles(UserRole.ADMIN)` nằm ở `admin` module; `WalletController` gated `WorkspaceContextGuard` theo membership, phục vụ Owner/Member đọc ví của chính workspace mình.

## Các phương án đã cân nhắc

### Phương án A — Method `adjust()` riêng trong `WalletLedgerService`, chỉ chạm `balance`

- Thêm một method ghi bút toán `MANUAL_ADJUSTMENT` xử lý cả hai chiều, cập nhật **duy nhất** `balance`, không chạm bất kỳ counter lũy kế nào. Tái dùng `lock()` (SELECT FOR UPDATE) và `ledgerData()` sẵn có; chiều trừ tái dùng đúng guard thiếu số dư của `debit()` (reject, không clamp).
- Ưu điểm: `credit()`/`debit()` giữ nguyên bất biến "mỗi credit/debit luôn khớp một counter" — không có nhánh null hoá counter dễ gọi nhầm. Ngữ nghĩa trung tính của manual adjustment được biểu đạt thẳng ở tầng ledger, một nơi duy nhất.
- Nhược điểm: thêm một method thứ ba trong ledger service.
- Tham chiếu: khớp pattern ledger một-method-một-ngữ-nghĩa đã dùng trong chính service này; mô hình double-entry/immutable ledger (Martin Fowler — "Accounting Patterns", posting rules tách biệt theo loại giao dịch).

### Phương án B — Nới `credit()`/`debit()` nhận counter nullable

- Cho phép truyền counter `null`/`'none'` để bỏ qua mutation counter.
- Ưu điểm: không thêm method.
- Nhược điểm: làm hỏng bất biến hiện tại (mọi credit/debit đều khớp một counter). Một lần gọi nhầm truyền `null` ở luồng topup/message sẽ âm thầm làm sai số liệu mà không có lỗi biên dịch. Tăng độ phức tạp của hai method nóng nhất của ví để phục vụ một luồng ngoại lệ tần suất thấp.

### Phương án C — Thêm field counter `totalManualAdjustment` vào `WalletAccount`

- Thêm cột schema cộng dồn riêng cho manual adjustment.
- Nhược điểm: không có requirement nào hiển thị chỉ số này (`BR-WALLET-02/05` không liệt kê). Thêm cột là đầu cơ cho nhu cầu chưa tồn tại; mọi truy vấn muốn phân biệt vẫn đọc được từ `WalletTransaction` theo `type`. Loại theo nguyên tắc ưu tiên giải pháp đơn giản nhất đáp ứng requirement hiện tại.

### Vị trí endpoint — Admin module vs Wallet module

- Đặt ở `admin` module: controller đã gated `@Roles(UserRole.ADMIN)`, đã có pattern resolve owner-từ-workspace (`impersonateWorkspaceOwner`) và đã nối `AuditLogService`. Mutation ledger vẫn gọi `WalletLedgerService` của wallet module (giống messaging/campaigns/topups gọi ledger dùng chung).
- Đặt ở `wallet` module (`WalletController`): controller này gated theo membership (`WorkspaceContextGuard`), thiết kế cho Owner/Member đọc ví của mình. Thêm mutation chỉ-ADMIN vào đây trộn hai mô hình phân quyền trong cùng controller và cần override guard.

## Quyết định

Chọn **Phương án A**: thêm method `WalletLedgerService.adjust(tx, params, direction)` chỉ cập nhật `balance`, ghi bút toán `MANUAL_ADJUSTMENT`, không chạm counter lũy kế. Chiều `DEBIT` reject khi `balance < amount` (tái dùng guard của `debit()`), không clamp về 0.

Endpoint đặt ở **admin module**: `POST /api/v1/admin/workspaces/:workspaceId/wallet-adjustment`. `AdminService` điều phối: resolve owner từ `workspaceId` và chỉ cho phép khi workspace ở trạng thái `active` (reject `BadRequestException` nếu không tồn tại hoặc non-active — cùng pattern `impersonateWorkspaceOwner`), mở `$transaction`, gọi `ledger.adjust()`, ghi audit trong cùng transaction. `AdminModule` import `WalletModule` để lấy `WalletLedgerService` (đã export sẵn).

Không thêm cơ chế idempotency key ở phiên bản này: đây là thao tác thủ công tần suất thấp qua REST đã xác thực. Hệ quả double-submit là một bút toán trùng nhìn thấy được; remedy có thật trong phạm vi hiện tại là admin thực hiện một adjustment chiều ngược lại (`DEBIT` để đảo một `CREDIT` trùng, `CREDIT` để đảo một `DEBIT` trùng). Chi phí hạ tầng idempotency key chưa tương xứng với rủi ro.

`MANUAL_ADJUSTMENT` ghi `sourceType = 'ADMIN_ADJUSTMENT'`. Không có bản ghi nguồn cho một điều chỉnh thủ công; `sourceId` (cột `String` non-nullable, `schema.prisma:354`) nhận `adminUserId` — là bản ghi `User` thực của admin thực hiện, giữ convention "`sourceId` trỏ tới một bản ghi thật" và cho `@@index([sourceType, sourceId])` truy vấn "mọi điều chỉnh của admin X". Không dùng `workspaceId`/`ownerUserId` cho `sourceId` vì hai giá trị này đã có cột + index riêng trên cùng bản ghi (lưu trùng). Giá trị trùng với `createdBy` được chấp nhận: `createdBy` không có index, còn `sourceId` phục vụ truy vấn qua composite index.

## Hệ quả

- `WalletLedgerService` có ba method: `credit()`, `debit()`, `adjust()`. Hai method cũ giữ nguyên bất biến khớp-counter; `adjust()` là method duy nhất không chạm counter lũy kế.
- Thiết kế chi tiết luồng và interface đọc kèm ADR này tại `docs/architecture/modules/wallet/component-design.md` và `docs/architecture/modules/admin/` (`component-design.md`, `interface-spec.md`).
- `AdminModule` phụ thuộc `WalletModule`; không tạo phụ thuộc ngược (wallet không biết admin).
- Audit ghi qua `AuditLogService.write({ tx })` trong cùng transaction với bút toán, thoả `BR-AUDIT-01`. Thêm action `wallet.manual_adjusted` và resource type `WalletTransaction` vào `audit-log.constants.ts`.
- `BR-ADMIN-05` (doanh thu/VAT/tổng topup) không bị ảnh hưởng: manual adjustment không tạo order/topup và không chạm counter lũy kế.

## Rủi ro đã chấp nhận (PO xác nhận 2026-11-10)

Thao tác điều chỉnh thủ công cố ý **không có** các lớp kiểm soát sau, PO đã cân nhắc và chấp nhận:
- **Không trần số tiền mỗi lần:** `amount` chỉ validate `> 0`, không có cap trên. Admin nhập tự do. Hệ quả: gõ nhầm (thừa một chữ số 0) cộng/trừ sai một lượng lớn. Nếu là `CREDIT` nhầm và owner **chưa tiêu**, admin đảo bằng một `DEBIT` cùng số; nhưng nếu owner **đã tiêu** phần cộng nhầm, lệnh `DEBIT` đảo sẽ bị guard `Insufficient credit` chặn — số tiền không thu hồi được qua endpoint này.
- **Không approve bước hai:** một mình ADMIN thực hiện, không có second-person approval.
- **Không idempotency:** double-submit tạo bút toán trùng (remedy ở mục Quyết định).

Đây là lựa chọn có cân nhắc, không phải thiếu sót. Lớp phòng vệ hiện có: `note` bắt buộc, audit log mọi lần, và guard chặn số dư âm.

## Cần xem lại quyết định khi

- Xảy ra sự cố nhập sai thực tế (nhầm lượng lớn, đặc biệt trường hợp không đảo được do owner đã tiêu) → cân nhắc thêm trần số tiền và/hoặc bước approve.
- Xuất hiện nhu cầu idempotency do double-submit thực tế → thêm idempotency key client-supplied.
- Cần cơ chế đảo bút toán chuẩn hơn adjustment-ngược-chiều → hiện thực bút toán loại `REVERSAL` (đã có trong enum `WalletTransactionType` nhưng **chưa có production code nào tạo**, không nằm trong phạm vi TICKET-007/008).
- Cần một chỉ số tổng hợp riêng cho manual adjustment → cân nhắc lại Phương án C.
