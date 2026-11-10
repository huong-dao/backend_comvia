# TICKET-008: Endpoint admin điều chỉnh số dư ví thủ công

**Issue:** ISSUE-006
**Rule/Thiết kế liên quan:** BR-WALLET-07, BR-ADMIN-02, BR-AUDIT-01 (`business-rules.md`); ADR-004; `docs/architecture/modules/admin/component-design.md#AdminService`; `docs/architecture/modules/admin/interface-spec.md`
**Độ ưu tiên:** High
**Phụ thuộc vào:** TICKET-007 (gọi `WalletLedgerService.adjust()`)

## Mục tiêu
ADMIN gọi `POST /api/v1/admin/workspaces/:workspaceId/wallet-adjustment` để cộng/trừ số dư ví của owner một workspace `active`, sinh bút toán `MANUAL_ADJUSTMENT` + audit log nguyên tử.

## Chỉ dẫn code

### 1. Hằng số audit — `src/audit-log/audit-log.constants.ts`
- Thêm `WALLET_ADJUSTED: 'wallet.manual_adjusted'` vào `AUDIT_ACTIONS`.
- Thêm `WALLET_TRANSACTION: 'WalletTransaction'` vào `AUDIT_RESOURCE_TYPES`.

### 2. DTO — `src/admin/dto/adjust-wallet.dto.ts` (mới)
`AdjustWalletDto` (dùng `class-validator`, global `ValidationPipe` đã bật ở `main.ts`):
- `direction`: `@IsIn(['CREDIT', 'DEBIT'])` — bắt buộc. Kiểu `'CREDIT' | 'DEBIT'`.
- `amount`: `@IsInt()` + `@Min(1)` — số dương VND, không nhận 0/âm/thập phân. (Khớp convention DTO giá hiện có, ví dụ `UpdateAdminCtaButtonPriceDto`.)
- `note`: `@Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))` + `@IsString()` + `@IsNotEmpty()` — lý do bắt buộc, không rỗng sau trim (BR-WALLET-07).

### 3. Route — `src/admin/admin.controller.ts`
Thêm vào `AdminController` (đã gated `@Roles(UserRole.ADMIN)` ở class; không thêm `WorkspaceContextGuard`):
```
@Post('workspaces/:workspaceId/wallet-adjustment')
adjustWorkspaceWallet(
  @Request() req: { user: { id: string } },
  @Param('workspaceId') workspaceId: string,
  @Body() dto: AdjustWalletDto,
) {
  return this.service.adjustWorkspaceWallet(req.user.id, workspaceId, dto);
}
```
Pass-through thuần, mirror `impersonateWorkspaceOwner` route (`admin.controller.ts:97-103`).

### 4. Service — `src/admin/admin.service.ts`
Inject `WalletLedgerService` (constructor) — có từ `WalletModule` (xem bước 5). Thêm method `async adjustWorkspaceWallet(adminUserId: string, workspaceId: string, dto: AdjustWalletDto)`:
1. `const workspace = await this.prismaService.workspace.findUnique({ where: { id: workspaceId }, select: { ownerUserId: true, status: true } })`.
2. `if (!workspace) throw new BadRequestException('Workspace not found')`.
3. `if (workspace.status !== 'ACTIVE') throw new BadRequestException('Cannot adjust the wallet of a non-active workspace')` — mirror pattern `impersonateWorkspaceOwner` (`admin.service.ts:218-225`). Không check `owner.status` (khác impersonate: ở đây không đăng nhập hộ, chỉ đổi số dư — interface-spec chỉ yêu cầu workspace `active`).
4. `return this.prismaService.$transaction(async (tx) => { ... })`:
   - `const { walletTransactionId, balanceBefore, balanceAfter } = await this.walletLedgerService.adjust(tx, { ownerUserId: workspace.ownerUserId, workspaceId, amount: dto.amount, type: WalletTransactionType.MANUAL_ADJUSTMENT, sourceType: 'ADMIN_ADJUSTMENT', sourceId: adminUserId, createdBy: adminUserId, note: dto.note }, dto.direction)` — chiều `DEBIT` thiếu số dư throw, lan ra rollback transaction. `sourceId = adminUserId` (không phải `workspaceId`): manual adjustment không có bản ghi nguồn; `workspaceId`/`ownerUserId` đã có cột riêng trên `WalletTransaction` nên dùng lại là lưu trùng; `sourceId` (cột `String` non-nullable) trỏ `User` admin thực hiện để giữ convention "sourceId trỏ bản ghi nguồn" và tận dụng `@@index([sourceType, sourceId])` (interface-spec admin, ADR-004).
   - `await this.auditLogService.write({ tx, actorUserId: adminUserId, workspaceId, action: AUDIT_ACTIONS.WALLET_ADJUSTED, resourceType: AUDIT_RESOURCE_TYPES.WALLET_TRANSACTION, resourceId: walletTransactionId, metadataJson: { direction: dto.direction, amount: dto.amount, note: dto.note, targetOwnerUserId: workspace.ownerUserId } })`.
   - `return { walletTransactionId, ownerUserId: workspace.ownerUserId, workspaceId, direction: dto.direction, amount: String(dto.amount), balanceBefore: balanceBefore.toString(), balanceAfter: balanceAfter.toString(), type: 'MANUAL_ADJUSTMENT' as const }` — khớp response interface-spec.

Audit + bút toán cùng `$transaction` → commit/rollback nguyên tử (không có đổi số dư mà thiếu audit, hay ngược lại).

**Không trích private helper `resolveActiveWorkspaceOwner`.** Giữ bước 1–3 inline. Lý do: hai call site (`impersonateWorkspaceOwner` và method này) khác nhau ở ba điểm — (a) `select` (impersonate cần full owner object gồm email/role/tokenVersion; ở đây chỉ cần `ownerUserId`), (b) impersonate còn check `owner.status`, ở đây không, (c) message lỗi khác nhau. Một helper chung phải tham số hóa cả ba, dài hơn và khó đọc hơn hai khối inline, đồng thời đụng lại code impersonate đã chạy production (ISSUE-002). Khi nào có call site thứ ba cần đúng cùng hợp đồng thì tách lại.

### 5. Module — `src/admin/admin.module.ts`
Thêm `WalletModule` vào `imports` (đã export `WalletLedgerService`). `PrismaModule`/`AuditLogModule` đã `@Global` nên không cần import tường minh.

### Entity/bảng Prisma đụng tới
`WalletAccount`, `WalletTransaction`, `AuditLog`. Không migration, không đổi schema.

### Convention
Theo `docs/architecture/coding-convention.md`. Không tạo phụ thuộc ngược wallet→admin (ADR-004).

## Acceptance Criteria (cấp code)
- [ ] `POST /api/v1/admin/workspaces/:workspaceId/wallet-adjustment` nhận `{ direction, amount, note }`, chỉ ADMIN gọi được (RolesGuard, 403 nếu không).
- [ ] `amount` ≤ 0 / không phải int / `note` rỗng sau trim / `direction` ngoài CREDIT|DEBIT → 400 (ValidationPipe).
- [ ] Workspace không tồn tại → 400 `Workspace not found`.
- [ ] Workspace không `active` → 400 `Cannot adjust the wallet of a non-active workspace`; không ghi bút toán, không ghi audit.
- [ ] CREDIT: số dư ví owner tăng đúng `amount`, bút toán `MANUAL_ADJUSTMENT` với `createdBy = adminUserId`, `note`, `sourceType = ADMIN_ADJUSTMENT`, `sourceId = adminUserId`; audit `wallet.manual_adjusted` ghi cùng transaction.
- [ ] DEBIT đủ số dư: số dư giảm đúng `amount`.
- [ ] DEBIT vượt số dư: 400 `Insufficient credit`, rollback — không bút toán, không audit, số dư không đổi.
- [ ] Không chạm `totalTopup`/`totalSpent`/`totalRefund` (đảm bảo bởi `adjust()` — TICKET-007).
- [ ] Response đúng shape interface-spec (`walletTransactionId, ownerUserId, workspaceId, direction, amount, balanceBefore, balanceAfter, type`).

## Definition of Done
Theo `docs/tickets/conventions.md`. Test bắt buộc: unit cho `AdminService.adjustWorkspaceWallet()` ở `src/admin/admin.service.spec.ts` (thêm `describe` mới, mirror cấu trúc `describe('AdminService.impersonateWorkspaceOwner')` sẵn có), mock `prismaService.workspace.findUnique` + `prismaService.$transaction` (impl gọi callback với một `tx` mock) + `walletLedgerService.adjust` + `auditLogService.write`. Thêm `{ provide: WalletLedgerService, useValue: { adjust: jest.fn() } }` vào providers test. Cover: happy CREDIT (adjust + audit gọi đúng tham số, trả summary), workspace not found (reject, không gọi adjust/audit), non-active (reject), DEBIT insufficient (adjust reject → audit không chạy). E2e không bắt buộc (controller pass-through thuần). Lint + build PASS.
