# ISSUE-006: Admin tự điều chỉnh số dư ví của workspace (cộng/trừ thủ công)

**Trạng thái:** Đang xử lý
**Phân loại:** Missing Spec
**Module liên quan:** Module 6 — Wallet Credit & Transactions; Module 13 — Admin Backoffice (BR-ADMIN-02); Module 14 — Audit Log (BR-AUDIT-01)

## Mô tả gốc từ khách hàng/PO

> "Có một yêu cầu là trong trường hợp muốn user có role ADMIN có thể tự thêm một transaction cho một workspace nào đó, mục đích là để thêm tiền vào ví (wallet) của workspace mà KHÔNG CẦN dùng bước nạp tiền (top-up) của OWNER. Ví dụ: ADMIN muốn thêm cho workspace A 500.000 VND và ghi chú cho transaction này là 'Admin tự thêm cho workspace'."

PO trả lời 6 câu hỏi mở (nguyên văn):
1. "Khi admin thêm tiền cho workspace, mục đích là ví dụ nạp tiền không qua hệ thống, nên admin cần tự thêm cho workspace. Ví dụ nạp thêm 500.000 thì ví của owner của workspace này sẽ có số dư +500.000, không cần VAT hay gì hết."
2. Chỉ user ADMIN (role hệ thống).
3. Note/reason bắt buộc.
4. Số dư không được âm, nhỏ nhất là 0.
5. Không cần OWNER approve.
6. Cho phép cả cộng VÀ trừ tiền.

Team bổ sung: use case thực tế là "khách chuyển khoản ngoài cổng thanh toán, admin cộng tay"; truy vết "tiền thật thu ngoài hệ thống" vs "credit tặng" dựa vào `note` bắt buộc. KHÔNG tính vào totalTopup, KHÔNG doanh thu, KHÔNG VAT.

## Rule hiện tại

Chưa có rule đặc tả thao tác này. Hiện chỉ có các rule *dành chỗ trước* nhưng chưa chi tiết hóa:
- `BR-WALLET-03`: `manual_adjustment` và `reversal` nằm trong tập `type` hợp lệ của `WalletTransaction`, có field `created_by` và `note`.
- `BR-WALLET-04`: "Không cho chỉnh số dư trực tiếp — mọi thay đổi phải đi qua transaction log."
- `BR-ADMIN-02` (Billing Operator): "...manual adjustment credit **nếu được phép**..." — điều kiện "được phép" chưa từng được định nghĩa.
- `BR-AUDIT-01`: "...cộng credit/refund/**adjustment** (log transaction)" — adjustment đã nằm trong phạm vi audit bắt buộc.

## Hành vi thực tế đã verify

- `prisma/schema.prisma:313-320` — enum `WalletTransactionType` đã có `MANUAL_ADJUSTMENT` và `REVERSAL`. `WalletTransaction` (`schema.prisma:343-357`) có `createdBy String?`, `note String?`, `workspaceId`, `ownerUserId` → đủ field để ghi một điều chỉnh thủ công có người thực hiện và lý do.
- **MANUAL_ADJUSTMENT chưa được ghi ở bất kỳ production code nào.** `WalletLedgerService.credit()` chỉ được gọi bởi topup (`TOPUP_CREDIT`) và campaign refund (`CAMPAIGN_REFUND`); `REVERSAL` chỉ xuất hiện trong spec test. Không có code nào tạo `MANUAL_ADJUSTMENT`.
- `src/admin/admin.controller.ts` (toàn bộ, gated `@Roles(UserRole.ADMIN)`) **không có endpoint cộng/trừ credit hay tạo wallet transaction**. Admin hiện chỉ: list/lock user, list/disable workspace, impersonate owner, audit logs, pricing config, template override.
- `UserRole` (`schema.prisma:14-18`) = `USER / ADMIN / STAFF`. ADMIN là role cấp hệ thống, tách biệt `MemberRole` (OWNER/MEMBER) cấp workspace → "Admin tự thêm tiền" là một quyền hệ thống riêng, không đi qua luồng top-up của OWNER.
- **Ví gắn với USER, không gắn với workspace.** `WalletAccount.ownerUserId @unique` (`schema.prisma:328-341`) — mỗi owner có đúng 1 ví dùng chung cho mọi workspace mình sở hữu (khớp `BR-WALLET-01`: "Ví đặt ở cấp owner"). `WalletTransaction` có cả `ownerUserId` (quyết định ví nào đổi số dư) lẫn `workspaceId` (ghi nhận điều chỉnh thực hiện trong ngữ cảnh workspace nào).
- **`debit()` reject khi thiếu số dư, KHÔNG clamp về 0.** `wallet-ledger.service.ts:29-30`: `if (wallet.balance.lessThan(amount)) throw new BadRequestException('Insufficient credit')`. Khớp yêu cầu #4/#6 của PO: trừ quá số dư thì request fail.
- `debit()` tăng `totalSpent`; `credit()` bắt buộc tăng `totalTopup` hoặc `totalRefund` (`wallet-ledger.service.ts:41-47, 67-76`). Với manual adjustment, việc cộng vào các counter này sẽ làm sai số liệu (xem Phân tích tác động).

## Hành vi mong đợi

ADMIN hệ thống có thao tác điều chỉnh số dư ví của một workspace (thực chất là ví của owner workspace đó), cộng hoặc trừ, không qua top-up/VAT/order:
- Chọn workspace → hệ thống xác định owner của workspace → điều chỉnh ví của owner đó.
- Cộng: tạo bút toán `MANUAL_ADJUSTMENT`, số dư tăng đúng số tiền nhập.
- Trừ: tạo bút toán `MANUAL_ADJUSTMENT`, số dư giảm; nếu số tiền trừ > số dư hiện tại → reject (số dư không được âm).
- `note`/lý do bắt buộc, không để trống.
- Ghi `createdBy` = ADMIN thực hiện; ghi audit log (BR-AUDIT-01).
- KHÔNG cộng vào `totalTopup`, KHÔNG tính doanh thu, KHÔNG VAT, không tạo order.

## Phân tích tác động

- **Module 6 (Wallet):** thêm loại bút toán `MANUAL_ADJUSTMENT` thực sự được dùng. Đi qua ledger nên tôn trọng `BR-WALLET-04` (không sửa balance trực tiếp). Bút toán vẫn ghi `balance_before/balance_after` bất biến (`BR-WALLET-03`).
- **Counter/metrics (cần SA quyết):** manual adjustment KHÔNG được tăng `totalTopup` (sẽ thổi phồng "tổng đã nạp" ở `BR-WALLET-02/05`) và KHÔNG được tăng `totalSpent` khi trừ (không phải chi cho gửi tin). Hàm `credit()`/`debit()` hiện bắt buộc đụng các counter này — cần nhánh xử lý riêng hoặc counter trung tính. Aggregate số dư theo tháng (`BR-WALLET-05`) lọc theo `topup_credit`/chi gửi tin nên về lý thuyết không bị manual adjustment làm nhiễu, nhưng `totalTopup`/`totalSpent` lũy kế thì có.
- **Module 13 (Admin / BR-ADMIN-05):** dashboard quản trị có "tổng topup, tổng doanh thu, tổng VAT" — manual adjustment phải bị loại khỏi các chỉ số này (không có tiền vào qua cổng, không VAT).
- **Ví dùng chung giữa nhiều workspace:** vì ví theo owner, nếu một owner sở hữu nhiều workspace, điều chỉnh "cho workspace A" sẽ làm đổi số dư dùng chung mà workspace B cũng tiêu. `workspaceId` trên bút toán chỉ ghi nhận ngữ cảnh, không cô lập số dư. Cần nêu rõ trong rule để tránh hiểu nhầm "ví riêng từng workspace".
- **Module 14 (Audit):** đã nằm trong phạm vi `BR-AUDIT-01`; cần đảm bảo mọi manual adjustment đều sinh audit log.
- **Đảo bút toán nhập nhầm (đã chốt 2026-11-10):** thực hiện một `manual_adjustment` chiều ngược lại (trừ để đảo một khoản cộng nhầm, cộng để đảo một khoản trừ nhầm). Loại `reversal` tồn tại trong enum `WalletTransactionType` nhưng **chưa được triển khai** (grep toàn repo: chỉ xuất hiện ở enum và một dòng spec, không có production code tạo `reversal`; TICKET-007/008 không implement) — là hướng tương lai, không phải chức năng hiện có. Lưu ý: nếu cộng nhầm rồi owner đã tiêu phần cộng nhầm thì lệnh trừ đảo chiều bị guard "Insufficient credit" chặn, không thu hồi được qua endpoint này (rủi ro PO đã chấp nhận — ADR-004).

## Giả định / Câu hỏi mở

- GIẢ ĐỊNH: "thêm cho workspace A" được hiểu là điều chỉnh ví của owner workspace A. PO đã xác nhận bản chất ở câu #1 ("ví của owner của workspace này"); đã làm rõ ví là của owner (dùng chung nhiều workspace nếu cùng owner), không phải ví riêng workspace.
- CHỐT (2026-11-10): **không áp trần số tiền mỗi lần điều chỉnh**, ADMIN nhập tự do (chỉ ràng buộc `amount > 0`), không có bước approve thứ hai. PO đã được nêu rủi ro gõ nhầm lượng lớn và rủi ro không thu hồi được nếu owner đã tiêu phần cộng nhầm, và chấp nhận có cân nhắc (ADR-004 mục "Rủi ro đã chấp nhận"). Lớp phòng vệ còn lại: `note` bắt buộc, audit log, guard chặn số dư âm.

## Hướng xử lý đề xuất

Missing Spec đã được PO xác nhận hướng → bổ sung rule mới `BR-WALLET-07` và cập nhật `BR-ADMIN-02` trong `business-rules.md` (đã thực hiện), ghi `change-log.md`. Chuyển SA thiết kế kỹ thuật (xem mục Cần SA quyết). Không viết code ở bước này.

### Cần SA quyết (chuyển tiếp qua docs/handoff/open-items.md)

1. **Counter/metrics trong `credit()`/`debit()`:** manual adjustment cộng KHÔNG tăng `totalTopup`; trừ KHÔNG tăng `totalSpent`. Cần nhánh riêng hay counter trung tính; đảm bảo loại khỏi `BR-WALLET-02/05` và `BR-ADMIN-05`.
2. **Hành vi debit khi thiếu số dư:** tái dùng `debit()` hiện có (đã reject đúng `wallet-ledger.service.ts:29-30`) hay nhánh riêng; xác nhận reject chứ không clamp 0.
3. **Endpoint:** một endpoint admin gộp cộng/trừ (ví dụ `POST /admin/workspaces/:workspaceId/wallet-adjustment` với amount âm/dương hoặc field direction) hay tách; cách resolve owner từ workspaceId; khóa ví (`FOR UPDATE`) khi điều chỉnh.
4. **Audit log:** đảm bảo mỗi manual adjustment sinh audit entry theo `BR-AUDIT-01`.

## Xử lý

- Rule: `BR-WALLET-07` (mới) + cập nhật `BR-ADMIN-02` trong `docs/business/business-rules.md`; change-log cập nhật.
- Handoff SA: `docs/handoff/open-items.md` (nhãn `CẦN SA LÀM RÕ:`).
- Ticket: _chờ SA đánh giá kiến trúc, sau đó Team Lead chẻ ticket._
