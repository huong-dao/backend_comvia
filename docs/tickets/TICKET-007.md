# TICKET-007: WalletLedgerService.adjust() — bút toán MANUAL_ADJUSTMENT trung tính counter

**Issue:** ISSUE-006
**Rule/Thiết kế liên quan:** BR-WALLET-03, BR-WALLET-04, BR-WALLET-07 (`business-rules.md`); ADR-004; `docs/architecture/modules/wallet/component-design.md#WalletLedgerService`
**Độ ưu tiên:** High
**Phụ thuộc vào:** —

## Mục tiêu
`WalletLedgerService` có method thứ ba `adjust()` ghi bút toán `MANUAL_ADJUSTMENT` cho cả hai chiều cộng/trừ, cập nhật chỉ `balance`, không chạm counter lũy kế nào.

## Chỉ dẫn code

Sửa `src/wallet/wallet-ledger.service.ts`.

### Method mới: `adjust(tx, params, direction)`
- Chữ ký:
  - `tx: Prisma.TransactionClient` — do caller cung cấp (không tự mở `$transaction`).
  - `params: WalletLedgerParams` — tái dùng type sẵn có; caller truyền `type: WalletTransactionType.MANUAL_ADJUSTMENT`, `sourceType`, `sourceId`, `createdBy`, `note`.
  - `direction: 'CREDIT' | 'DEBIT'` — tham số thứ ba quyết chiều. Khai báo và export một type alias `WalletAdjustDirection = 'CREDIT' | 'DEBIT'` trong cùng file để admin service dùng chung (tránh lặp literal).
- Trách nhiệm/các bước theo thứ tự:
  1. `const wallet = await this.lock(tx, params.ownerUserId)` — tái dùng `lock()` sẵn có (SELECT ... FOR UPDATE; đã throw `BadRequestException('Wallet not initialized')` khi ví chưa có).
  2. `const amount = new Prisma.Decimal(params.amount)`.
  3. Nếu `direction === 'DEBIT'`: nếu `wallet.balance.lessThan(amount)` → `throw new BadRequestException('Insufficient credit')` (tái dùng đúng guard và đúng message của `debit()`; KHÔNG clamp về 0). `balanceAfter = wallet.balance.minus(amount)`.
  4. Nếu `direction === 'CREDIT'`: `balanceAfter = wallet.balance.plus(amount)`.
  5. `tx.walletTransaction.create({ data: { ...this.ledgerData(params, wallet.balance, balanceAfter) }, select: { id: true } })` — tái dùng `ledgerData()` sẵn có (dựng `balanceBefore`/`balanceAfter` bất biến + `transactionCode`).
  6. `tx.walletAccount.update({ where: { ownerUserId: params.ownerUserId }, data: { balance: balanceAfter } })` — **chỉ** field `balance`. KHÔNG set `totalTopup` / `totalSpent` / `totalRefund` (đây là điểm khác biệt cốt lõi so với `credit()`/`debit()` — xem ADR-004).
  7. Trả về `{ walletTransactionId: transaction.id, balanceBefore: wallet.balance, balanceAfter }`.

### Lý do trả về object (không chỉ id)
`credit()`/`debit()` trả `Promise<string>` (id). `adjust()` trả object vì interface-spec admin (`modules/admin/interface-spec.md`) yêu cầu response có `balanceBefore`/`balanceAfter`, và `adjust()` đã tính sẵn hai giá trị này; để caller khỏi phải đọc lại bản ghi. Đây là cụ thể hóa interface-spec, không phải thêm thiết kế mới.

### Entity/bảng Prisma đụng tới
- `WalletAccount` (chỉ `balance`), `WalletTransaction` (tạo bản ghi `MANUAL_ADJUSTMENT`, `status` mặc định `SUCCESS` theo schema). Không migration, không đổi schema.

### Convention
Theo `docs/architecture/coding-convention.md`. Không tự mở transaction trong ledger; giữ ledger là điểm ghi số dư duy nhất.

## Acceptance Criteria (cấp code)
- [ ] `adjust()` chiều `CREDIT`: `balanceAfter = balance + amount`, tạo đúng một `WalletTransaction` type `MANUAL_ADJUSTMENT`, `walletAccount.update` chỉ chứa `balance` (không có key `totalTopup`/`totalSpent`/`totalRefund`).
- [ ] `adjust()` chiều `DEBIT` đủ số dư: `balanceAfter = balance − amount`, tương tự không chạm counter.
- [ ] `adjust()` chiều `DEBIT` khi `balance < amount`: throw `BadRequestException('Insufficient credit')`, KHÔNG tạo transaction, KHÔNG update ví.
- [ ] `adjust()` khi ví chưa khởi tạo (`lock()` trả rỗng): throw `BadRequestException('Wallet not initialized')`.
- [ ] Trả về `{ walletTransactionId, balanceBefore, balanceAfter }`.
- [ ] `credit()` và `debit()` giữ nguyên, không sửa.

## Definition of Done
Theo `docs/tickets/conventions.md`. Test bắt buộc: unit `src/wallet/wallet-ledger.service.spec.ts` (nếu chưa có thì tạo mới), mock `tx` là object có `$queryRaw` (trả `[{ balance: new Prisma.Decimal(...) }]`), `walletTransaction.create`, `walletAccount.update` là `jest.fn()`. Cover 4 ca: CREDIT, DEBIT đủ số dư, DEBIT thiếu số dư (throw + không ghi), ví chưa khởi tạo. Khẳng định `walletAccount.update` được gọi với `data` không chứa counter. Lint + build PASS.
