# Component Design — admin

Backoffice cho user role hệ thống `ADMIN`. Toàn controller gated `@Roles(UserRole.ADMIN)`. Admin điều phối nghiệp vụ bằng cách gọi service dùng chung của module khác (ledger ví, template), không tự ghi số dư/trạng thái trực tiếp.

## AdminController
**Trách nhiệm:** phơi các endpoint quản trị: liệt kê/khoá user, liệt kê/disable workspace, impersonate owner, liệt kê OA connection, audit logs, cấu hình giá, override template, và **điều chỉnh số dư ví thủ công** (ADR-004).
**Cấu trúc bên trong:** Controller → `AdminService` / `SystemConfigService` / `TemplatesService`. Route điều chỉnh ví: `POST workspaces/:workspaceId/wallet-adjustment` → `AdminService.adjustWorkspaceWallet()`.
**Phụ thuộc:** `AdminService`, `SystemConfigService`, `TemplatesService`; `RolesGuard` (áp ở tầng controller).
**Rule/Requirement liên quan:** BR-ADMIN-01, BR-ADMIN-02, BR-ADMIN-03, BR-ADMIN-05, BR-WALLET-07.

## AdminService
**Trách nhiệm:** điều phối thao tác quản trị trên nhiều module; với điều chỉnh ví, điều phối resolve-owner + ghi bút toán + audit trong một transaction.
**Cấu trúc bên trong (luồng `adjustWorkspaceWallet(adminUserId, workspaceId, dto)`):**
1. Resolve owner + kiểm tra active: `workspace.findUnique({ where: { id: workspaceId }, select: { ownerUserId, status } })`; reject `BadRequestException` nếu workspace không tồn tại; reject `BadRequestException` nếu `status !== 'ACTIVE'` (chỉ điều chỉnh ví khi workspace `active` — BR-WALLET-07). Đây đúng pattern đã dùng ở `impersonateWorkspaceOwner` (`admin.service.ts:197-228`: findUnique kèm `status` rồi chặn non-active bằng `BadRequestException`) — Dev tái dùng pattern này, không viết guard mới. Không có helper dùng chung resolve+check sẵn; nếu muốn khử trùng lặp với impersonate, trích một private helper `resolveActiveWorkspaceOwner(workspaceId)` trong `AdminService` (tuỳ Team Lead/Dev).
2. Mở `PrismaService.$transaction`:
   - gọi `walletLedgerService.adjust(tx, { ownerUserId, workspaceId, amount, type: MANUAL_ADJUSTMENT, sourceType: 'ADMIN_ADJUSTMENT', sourceId: adminUserId, createdBy: adminUserId, note }, direction)` → trả `walletTransactionId`. `sourceId = adminUserId` vì manual adjustment không có bản ghi nguồn và cột `sourceId` non-nullable (ADR-004). Chiều `DEBIT` reject khi thiếu số dư (ngoại lệ lan ra, rollback transaction).
   - `auditLogService.write({ tx, actorUserId: adminUserId, workspaceId, action: 'wallet.manual_adjusted', resourceType: 'WalletTransaction', resourceId: walletTransactionId, metadataJson: { direction, amount, note, targetOwnerUserId } })`.
3. Trả bản tóm tắt (walletTransactionId, direction, amount, balanceAfter).

Audit và bút toán ghi trong cùng transaction nên commit/rollback nguyên tử — không có trường hợp đổi số dư mà thiếu audit, hoặc audit mà không đổi số dư.
**Phụ thuộc:** `PrismaService` (global), `AuditLogService` (global), `WalletLedgerService` (từ `WalletModule`), `JwtService`.
**Rule/Requirement liên quan:** BR-WALLET-07, BR-ADMIN-02, BR-AUDIT-01.

## AdminModule — phụ thuộc
Hiện import `TemplatesModule`, `AuthModule`. **Bổ sung import `WalletModule`** để lấy `WalletLedgerService`. `PrismaModule` và `AuditLogModule` đã là `@Global` nên không cần import tường minh. Không tạo phụ thuộc ngược từ wallet sang admin (ADR-004).

## Hằng số audit bổ sung
Thêm vào `src/audit-log/audit-log.constants.ts`:
- `AUDIT_ACTIONS.WALLET_ADJUSTED = 'wallet.manual_adjusted'`.
- `AUDIT_RESOURCE_TYPES.WALLET_TRANSACTION = 'WalletTransaction'`.
