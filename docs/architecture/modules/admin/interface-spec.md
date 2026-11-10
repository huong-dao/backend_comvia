# Interface Spec — admin

## Endpoint nội bộ: POST /api/v1/admin/workspaces/:workspaceId/wallet-adjustment
**Mục đích:** ADMIN điều chỉnh số dư ví của owner một workspace (cộng hoặc trừ) không qua luồng topup/thanh toán (BR-WALLET-07).
**Request DTO (`AdjustWalletDto`):**
- `direction`: enum `CREDIT` | `DEBIT` — bắt buộc. `CREDIT` tăng số dư, `DEBIT` giảm.
- `amount`: số dương, > 0 (Decimal/VND). Không nhận 0 hoặc âm; chiều điều chỉnh do `direction` quyết định.
- `note`: string bắt buộc, không rỗng sau khi trim (lý do điều chỉnh — BR-WALLET-07).

**Response (200):**
```
{
  walletTransactionId: string,
  ownerUserId: string,
  workspaceId: string,
  direction: 'CREDIT' | 'DEBIT',
  amount: string,          // Decimal VND
  balanceBefore: string,
  balanceAfter: string,
  type: 'MANUAL_ADJUSTMENT'
}
```
**Lỗi:**
- `400` — workspace không tồn tại; workspace không ở trạng thái `active` (`disabled`/`suspended`/`deleted`), message `Cannot adjust the wallet of a non-active workspace` (mirror pattern impersonate `admin.service.ts:221`, `BadRequestException`); `note` rỗng; `amount` ≤ 0; `DEBIT` vượt số dư hiện tại ("Insufficient credit", reject không clamp).
- `403` — người gọi không phải role `ADMIN` (RolesGuard).

**Guard áp dụng:** `JwtAuthGuard` (toàn hệ thống) + `RolesGuard` với `@Roles(UserRole.ADMIN)` (áp ở `AdminController`). Không dùng `WorkspaceContextGuard` — đây là thao tác hệ thống, không theo membership.
**Idempotency:** không có idempotency key ở phiên bản này (ADR-004). Double-submit tạo bút toán trùng nhìn thấy được; remedy là admin thực hiện một adjustment chiều ngược lại (`DEBIT` đảo `CREDIT`, `CREDIT` đảo `DEBIT`). Giới hạn: nếu owner đã tiêu phần cộng nhầm thì lệnh `DEBIT` đảo bị chặn `Insufficient credit` — không thu hồi được qua endpoint này.
**Liên quan:** BR-WALLET-07, BR-ADMIN-02, BR-AUDIT-01.

## Hợp đồng dữ liệu: bút toán MANUAL_ADJUSTMENT (ghi vào WalletTransaction)
**Các trường bắt buộc:**
- `type` = `MANUAL_ADJUSTMENT`, `status` = `SUCCESS`.
- `ownerUserId` (resolve từ `workspaceId`), `workspaceId` (ngữ cảnh điều chỉnh).
- `amount` (dương), `balanceBefore`, `balanceAfter` (bất biến tại thời điểm chốt).
- `sourceType` = `ADMIN_ADJUSTMENT`; `sourceId` = `adminUserId` (manual adjustment không có bản ghi nguồn; `sourceId` là cột `String` non-nullable nên trỏ tới `User` của admin thực hiện — không dùng `workspaceId`/`ownerUserId` vì đã có cột riêng, lưu trùng. Xem ADR-004).
- `createdBy` = `userId` của ADMIN thực hiện; `note` không rỗng.
- Không chạm `totalTopup` / `totalSpent` / `totalRefund` trên `WalletAccount`.

## Hợp đồng dữ liệu: audit entry cho mỗi điều chỉnh
**Các trường bắt buộc:** `actorUserId` = admin; `workspaceId`; `action` = `wallet.manual_adjusted`; `resourceType` = `WalletTransaction`; `resourceId` = `walletTransactionId`; `metadataJson` = `{ direction, amount, note, targetOwnerUserId }`. Ghi trong cùng `$transaction` với bút toán.
