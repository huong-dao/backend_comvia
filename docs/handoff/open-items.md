# Open Items — Handoff giữa các vai

Mỗi mục ghi nhãn `CẦN <VAI> LÀM RÕ:` + link tới issue/tài liệu nguồn. Vai được gọi tên xử lý rồi đánh dấu đã xong.

---

## [ĐÃ XỬ LÝ — SA, 2026-11-10] ISSUE-006 — Admin điều chỉnh số dư ví thủ công

Nguồn: `docs/business/issues/ISSUE-006-admin-manual-wallet-adjustment.md` · Rule: `BR-WALLET-07` (mới), `BR-ADMIN-02` (cập nhật).
Thiết kế: ADR-004; `docs/architecture/modules/wallet/component-design.md`; `docs/architecture/modules/admin/{component-design,interface-spec}.md`.

Kết luận 4 điểm:

1. **Counter/metrics:** thêm method `WalletLedgerService.adjust(tx, params, direction)` ghi bút toán `MANUAL_ADJUSTMENT`, cập nhật **chỉ** `balance`, không chạm `totalTopup`/`totalSpent`/`totalRefund`. Không nới counter nullable ở `credit()`/`debit()`, không thêm field schema (ADR-004). Số liệu theo tháng (`BR-WALLET-05`) đã lọc theo type nên vốn không bị nhiễu; `BR-ADMIN-05` không bị ảnh hưởng vì không tạo order/topup và không chạm counter.
2. **Debit thiếu số dư:** `adjust()` chiều `DEBIT` tái dùng guard của `debit()` — reject khi `balance < amount`, KHÔNG clamp 0. Không tái dùng trực tiếp `debit()` vì method đó tăng `totalSpent`.
3. **Endpoint & resolve owner:** một endpoint gộp cộng/trừ `POST /api/v1/admin/workspaces/:workspaceId/wallet-adjustment`, body có `direction` (CREDIT/DEBIT) + `amount` dương + `note` bắt buộc. Đặt ở admin module (đã gated `@Roles(ADMIN)`); resolve owner `workspace.findUnique → ownerUserId`; khoá ví qua `lock()` SELECT FOR UPDATE sẵn có trong `adjust()`. Không idempotency key (ADR-004). `AdminModule` bổ sung import `WalletModule`.
4. **Audit:** `AuditLogService.write({ tx })` trong cùng `$transaction` với bút toán, action `wallet.manual_adjusted`, resource `WalletTransaction`. Thêm hằng số vào `audit-log.constants.ts`.

Chuyển Team Lead chẻ ticket theo các tài liệu trên.

## [ĐÃ XỬ LÝ — PO + SA, 2026-11-10] ISSUE-006 — gating theo trạng thái workspace khi điều chỉnh ví

PO chốt: **chỉ cho phép điều chỉnh ví khi workspace `active`**; `disabled`/`suspended`/`deleted` → reject. Đã cập nhật: `BR-WALLET-07` (thêm dòng ràng buộc), change-log, ADR-004, `modules/admin/component-design.md` + `interface-spec.md`. Hiện thực tái dùng pattern `impersonateWorkspaceOwner` (`admin.service.ts:197-228`): resolve owner kèm `status`, reject non-active bằng `BadRequestException` (400), message `Cannot adjust the wallet of a non-active workspace`. Không có helper dùng chung sẵn; Dev theo pattern inline của impersonate (có thể trích private helper chung tuỳ Team Lead).

## [ĐÃ XỬ LÝ — PO + SA, 2026-11-10] ISSUE-006 — không giới hạn số tiền + sửa sourceId + remedy đảo bút toán

Review vòng 2 (coordinator + PO), SA đã cập nhật ADR-004 + `modules/admin/{interface-spec,component-design}.md`:
- **Không trần số tiền:** PO chấp nhận rủi ro có ý thức (nhập tự do, chỉ validate `amount > 0`, không cap/approve/idempotency). Ghi ở mục "Rủi ro đã chấp nhận" của ADR-004 kèm điều kiện kích hoạt xem lại.
- **`sourceId` sửa từ `workspaceId` → `adminUserId`:** `sourceId` (cột `String` non-nullable, `schema.prisma:354`) phải có giá trị; manual adjustment không có bản ghi nguồn; dùng `workspaceId`/`ownerUserId` là lưu trùng cột sẵn có. Chọn `adminUserId` (trỏ `User` admin thực hiện) để giữ convention và tận dụng `@@index([sourceType, sourceId])`.
- **Remedy đảo lệnh nhầm:** sửa câu chữ "đảo bằng `REVERSAL`" (chức năng chưa tồn tại — chỉ có trong enum + 1 spec, không production code) thành adjustment chiều ngược lại, kèm giới hạn không thu hồi được nếu owner đã tiêu phần cộng nhầm. `REVERSAL` ghi vào "Cần xem lại" như hướng tương lai.

### [ĐÃ XỬ LÝ — Team Lead, 2026-11-10] TICKET-008 sửa theo review vòng 2
`TICKET-008.md` đã đổi `sourceId = workspaceId` → `sourceId = adminUserId` ở cả chỉ dẫn code (bước 4) và acceptance criteria, kèm lý do trỏ interface-spec/ADR-004. `TICKET-007` verify lại: chỉ truyền `sourceId` generic qua `WalletLedgerParams`, không hardcode giá trị → không ảnh hưởng. Không có chỗ nào trong hai ticket nhắc `REVERSAL` như cơ chế đã có, hay ám chỉ trần số tiền → không cần sửa thêm cho điểm 2 và 3.

### CẦN BA LƯU Ý: wording REVERSAL trong BR-WALLET-07
`BR-WALLET-07` nêu "Đảo một bút toán `manual_adjustment` nhập nhầm: tạo bút toán mới loại `reversal`". `REVERSAL` hiện chưa có production code (không nằm trong TICKET-007/008). Đây là cơ chế business dự kiến, chưa hiện thực. BA cân nhắc có cần ghi chú "chưa triển khai" vào rule để tránh hiểu nhầm đã có; không chặn thiết kế hiện tại.
