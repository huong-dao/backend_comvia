# FE quick reference — Subscriptions + thay đổi docs gần đây (2026-11-23)

Bản ngắn để làm nhanh. Contract gốc: [API guide](../FRONTEND_API_GUIDE_NEXTJS.mdc) và [Admin map](../FRONTEND_ADMIN_ROUTER_API_MAP.mdc). Bản chi tiết + checklist: [fe-subscription-handoff-2026-11-23.md](./fe-subscription-handoff-2026-11-23.md). Nếu có chỗ lệch, guide thắng.

---

# A. Subscriptions

## A1. Quy ước

- Base URL: `NEXT_PUBLIC_API_BASE_URL` (đã gồm `/api/v1`). Auth: `Authorization: Bearer <token>`.
- Mọi API workspace ở A3 cần header **`x-workspace-id`** (thiếu, hoặc workspace/membership không `ACTIVE` → `403`).
- Body có field thừa → `400`. Phân trang: `{ data, meta: { page, limit, total, totalPages } }`, `limit` tối đa 100.
- Admin: prefix `/admin/*`, chỉ `ADMIN` (`STAFF` bị từ chối → ẩn menu).

## A2. Route FE

| Route | Bắt buộc | Nội dung |
|---|---|---|
| `/app/subscription` | Có (email nhắc trỏ vào) | Trạng thái gói, danh sách gói, mua + QR, lịch sử |
| `/app/wallet` | Có (email "ví sắp hết") | Trang ví |
| Menu Admin → Subscriptions | Có | Gói / Danh sách / Cấu hình chung (path FE tự chọn) |
| `/subscription/success` | Không | Luồng QR không có redirect về FE; FE poll trạng thái |

## A3. API workspace

| API | Quyền | Dùng cho |
|---|---|---|
| `GET /subscriptions/current` | member | Banner, `canSend` |
| `GET /subscription-plans?page&limit&keyword&durationYears` | member | Gói đang bán (`limit` mặc định 20) |
| `GET /public/money-accounts/active-for-topup` | JWT | Chọn tài khoản ngân hàng |
| `POST /subscriptions/purchase/create-with-pay2s` `{planId, moneyAccountId}` | OWNER | Tạo đơn + QR |
| `GET /subscriptions/purchases/:purchaseCode/status` | OWNER | Poll tới `PAID`/`FAILED` (3–5 giây là gợi ý), không thấy → `404` |
| `GET /subscriptions/history?page&limit&status` | OWNER | Lịch sử, `status` ∈ `PENDING\|PAID\|FAILED` |
| `GET /workspaces/:workspaceId/orders` | OWNER | Mảng thô, **không có `meta`**; đơn mua gói có `type: "SUBSCRIPTION"`. Dùng path param, không dùng header |

**`/current`:** `{ status: NONE|ACTIVE|EXPIRED, canSend, plan{id,code,name}|null, startsAt, endsAt, daysRemaining, expiredAt }`
- `NONE`/`EXPIRED` → `canSend=false`. Chọn banner theo `status`. `endsAt` đã cộng dồn các kỳ liền kề.
- Workspace chỉ có kỳ chưa bắt đầu → `/current` trả `NONE` (chờ chốt, ISSUE-010): chỉ dựa vào `status`.

**Gói:** `id, code, name, description (có thể null), durationYears, priceExclVat, vatPercent, vatAmount, totalAmountInclVat, isActive, sortOrder`. Số khách chuyển khoản = `totalAmountInclVat`.

**Đơn mua:** `id, purchaseCode, planId, planName, durationYears, amountExclVat, vatPercent, vatAmount, amountInclVat, status, qrCodeUrl, paidAt, createdAt` + `expectedStartsAt/expectedEndsAt` (chỉ ở bước tạo, là dự kiến).
- Lịch sử thêm `order{id,orderCode}|null`, `startsAt`, `endsAt` (là `null` nếu chưa thanh toán).
- `qrCodeUrl` là ảnh PNG → `<img src>`; URL gốc backend, không có `/api/v1`.

**Luồng mua:** chọn gói → chọn tài khoản → tạo đơn → hiện QR ngay trên `/app/subscription` → poll `purchaseCode` → `PAID` thì gọi lại `/current` và đóng QR. Khách quét QR bằng app ngân hàng, Pay2S báo backend bằng webhook; **FE không nhận redirect/callback nào**. Đơn `PENDING` không tự hết hạn; QR mới = đơn mới. Mua khi còn hạn thì cộng dồn; mua gói không cộng ví.

## A4. Lỗi (`400`)

| `code` | Khi nào | FE làm |
|---|---|---|
| `SUBSCRIPTION_REQUIRED` | Gửi tin, workspace chưa từng có gói | Hiện `message` + nút tới `/app/subscription` |
| `SUBSCRIPTION_EXPIRED` | Gửi tin, gói hết hạn | Như trên |
| `PAY2S_UNAVAILABLE` | Tạo QR lỗi (mua gói **và topup**) | Hiện `message` + nút Thử lại (tạo đơn mới) |
| không có `code` | Gói không bán; tổng < 10.000đ; tài khoản ngân hàng sai | Hiện `message` thô |

- `SUBSCRIPTION_*` áp dụng cho `send-single`, campaign `execute`/`retry`/`resume`, Public API. Không tạo `MessageLog`, không trừ ví.
- Disable nút gửi khi `canSend=false`, nhưng vẫn xử lý lỗi từ server (gói có thể hết giữa chừng).
- `PAY2S_UNAVAILABLE` (commit `6e38526`) có thể chưa lên server; trước đó lỗi là chuỗi tiếng Anh → xử lý cả hai dạng.

## A5. Campaign bị tạm dừng

- `pauseReason = "SUBSCRIPTION_EXPIRED"` (hoặc `"OA_DISCONNECTED"`): chỉ hiện nút **Tiếp tục** `POST /workspaces/:workspaceId/campaigns/:id/resume`. Với `SUBSCRIPTION_EXPIRED` chỉ bật khi `/current` có `canSend=true`.
- **Ẩn** Retry, Reconcile, Execute (các route đó trả lỗi tiếng Anh không có `code`). `execute` trên campaign đang pause tự thành resume.
- `resume` không trừ ví lần nữa. `pauseReason` lạ → xử lý như `PAUSED` chung.

## A6. API Admin

| API | Dùng cho |
|---|---|
| `GET/POST /admin/subscription-plans`, `GET/PATCH /admin/subscription-plans/:planId` | Gói (không có xoá; ngừng bán `isActive=false`) |
| `GET /admin/subscriptions`, `GET/PATCH /admin/subscriptions/:id` | Subscription của workspace |
| `POST /admin/workspaces/:workspaceId/subscriptions` | Cấp tay |
| `GET/PATCH /admin/config/general` | Cấu hình chung |
| `GET /admin/orders?type=TOPUP\|SUBSCRIPTION` | Đơn hàng |

- **Tạo gói:** bắt buộc `name` (≤120), `priceExclVat` (≥0), `vatPercent` (0–100), `durationYears` (1–20). Tùy chọn `code` (2–40 ký tự, trùng → `409`), `description` (≤500), `isActive`, `sortOrder`. `PATCH` **không nhận `code`** (gửi → `400`).
- Form tính live: `price + round(price × vat / 100)`. Gói tổng sau VAT < 10.000đ tạo được nhưng owner **không mua được** → cảnh báo ở form.
- **List subscription:** filter `workspaceId, keyword, planId, state (ACTIVE|UPCOMING|EXPIRED|CANCELLED), endsAtFrom, endsAtTo, page, limit` (limit mặc định 30). Phần tử: `id, workspace{…,owner}, plan, order|null, purchaseId, source (PURCHASE|ADMIN_GRANT), startsAt, endsAt, durationDays, status (ACTIVE|CANCELLED), state, daysRemaining, note`. Badge theo `state`.
- **Sửa:** `{planId?, startsAt?, endsAt?, status?, note?}`; `endsAt` phải sau `startsAt` (`400`); `status:"CANCELLED"` = thu hồi ngay → cần hộp xác nhận.
- **Cấp tay:** `{planId, startsAt?, endsAt?, note?}`; bỏ trống ngày = cộng dồn; chỉ gửi `startsAt` → `endsAt = startsAt + số năm`. `startsAt` tương lai cho workspace chưa có kỳ nào → workspace chưa gửi được tin tới ngày đó (cảnh báo ở form). Response `PATCH`/cấp tay cùng shape phần tử list.
- **Cấu hình chung:** `{ subscriptionExpiryReminderDays (1–365, mặc định 7), walletLowBalanceThreshold (VND ≥0; 0/null = tắt) }`; `PATCH` chỉ cập nhật field được gửi.
- `GET /admin/orders/:orderId` với đơn `SUBSCRIPTION` → `topupRequest = null` (xử lý null).

## A7. Cần biết

- **Chặn gửi tin đã bật, không backfill.** Workspace chưa có gói không gửi được tin → màn Admin cấp tay cần xong sớm.
- **Pay2S trên live là thanh toán thật.** QA dùng gói test giá thấp (tổng ≥ 10.000đ), tắt gói sau khi test.

```ts
type CurrentSubscriptionStatus = 'NONE' | 'ACTIVE' | 'EXPIRED';
type SubscriptionState = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED';
type WorkspaceSubscriptionStatus = 'ACTIVE' | 'CANCELLED';
type SubscriptionPurchaseStatus = 'PENDING' | 'PAID' | 'FAILED';
type OrderType = 'TOPUP' | 'SUBSCRIPTION';
type SubscriptionSource = 'PURCHASE' | 'ADMIN_GRANT';
type CampaignPauseReason = 'OA_DISCONNECTED' | 'SUBSCRIPTION_EXPIRED' | null;
```

---

# B. Thay đổi gần đây trong docs (từ 2026-11-10)

Mới nhất trước. Cột "Nguồn" là mục trong guide/admin map để đọc chi tiết.

| Ngày | Thay đổi | FE cần làm | Nguồn |
|---|---|---|---|
| 11-23 | **Subscriptions** (phần A) + `PAY2S_UNAVAILABLE` cho topup và mua gói + `pauseReason = SUBSCRIPTION_EXPIRED` + order có `type`/`subscriptionPurchaseId` | Làm theo phần A | Guide 9B, 9.4, mục campaign; Admin map 8A |
| 11-19 | **Campaign `resume` + `pauseReason`:** campaign `PAUSED` do OA mất kết nối có `pauseReason: "OA_DISCONNECTED"`; `POST …/campaigns/:id/resume` (không body, không trừ ví lại); `execute` coi như `resume`; `retry`/`reconcile` trả `400` | Hiển thị lý do, chỉ cho nút Tiếp tục; `resume` lỗi `OA_NOT_CONNECTED` → dẫn tới trang kết nối OA | Guide mục campaign ("Tạm dừng tự động") |
| 11-19 | **Template trả `providerTemplateId`** trong list, `GET /:templateId` và response `POST` (`null` cho tới khi staff approve) | Thêm field vào type; `null` với mọi `DRAFT`/`SUBMITTED` | Guide 7.1–7.2 |
| 11-19 | **Lọc message logs theo `phoneNumber`** (khớp một phần, AND với filter khác). BE bỏ ký tự không phải số, bỏ đầu `84`/`0`, dùng tối đa 9 số cuối → `0912`, `+84 912`, `912` cho cùng kết quả. `limit` 1–100, mặc định 50 | Thêm ô tìm SĐT, gửi nguyên văn | Guide 8.2 |
| 11-18 | **Template `placeholderOrder`** (`string[] \| null`): thứ tự hiển thị placeholder. Slug phải nằm trong `placeholdersJson`, không trùng, nếu không `400`; thiếu slug thì BE nối vào cuối. `null` (template cũ) → FE suy ra từ thứ tự khóa của `placeholdersJson`. Chịu cùng quy tắc khóa như `content` (`409` khi đã `SUBMITTED`/`APPROVED`) | Dùng thứ tự này cho form, bảng xem trước (TABLE) và hiển thị khi gửi | Guide 7 |
| 11-18 | **Template thêm `content2`, `secondaryContent2`; `secondaryContent` nhận ở mọi loại** (không chỉ `TABLE`). `null` = xóa, bỏ field = giữ nguyên (PATCH). Owner bị khóa (`409`) như `content`; admin sửa mọi trạng thái | Thêm 3 ô vào form và type; đừng ẩn `secondaryContent` theo `type` | Guide 7 |
| 11-18 | **CSV template: các cột placeholder xếp theo `placeholderOrder`** | Không cần đổi code; đúng thứ tự cột khi hiển thị | Guide mục campaign |
| 11-11 | **CSV: quay lại cột `row_id`** (bản `Stt` đã bị rollback). Template bắt đầu bằng BOM UTF-8 → **tải bằng blob** (`responseType:'blob'` / `fetch().blob()`), **không** dùng `.text()` rồi tạo lại `Blob` (mất BOM, Excel lỗi font). Ô `Phone` mẫu là `="0901234567"`; import chấp nhận cả số 9 chữ số mất số 0 | Giữ blob nguyên vẹn khi tải; đừng tự sửa `row_id` | Guide mục campaign (csv-template) |
| 11-11 | **`import-csv/reconcile`:** file chỉ được có cột `row_id`, `Phone` và đúng các cột placeholder (cột lạ → từ chối cả file); thứ tự dòng không quan trọng; có thể chỉ chứa một phần dòng; file chứa dòng `PROCESSING`/`RECONCILIATION_REQUIRED`/`SKIPPED` bị từ chối **kể cả khi không đổi** → chỉ đưa các dòng cần sửa (thường `FAILED`). Response `{ campaignId, updated, unchanged, pendingRows }`; lỗi `400` `{ message: "CSV validation failed", errors: [...] }` với `Row <n>: …` (dòng vật lý, header là 1) hoặc `row_id <id>: …`. campaign `PAUSED` thông thường (cần đối soát) được phép reconcile, nhưng khi `pauseReason` là `OA_DISCONNECTED`/`SUBSCRIPTION_EXPIRED` thì `400` | Hiển thị danh sách `errors`; không cho user thêm/đổi tên cột | Guide mục campaign |
| 11-11 | `GET …/campaigns/:id/rows?status=&limit=`: `limit` mặc định 100, tối đa 500, **không phân trang**, sắp theo `createdAt` | Không giả định có phân trang | Guide mục campaign |
| 11-10 | **Admin điều chỉnh ví thủ công** `POST /admin/workspaces/:workspaceId/wallet-adjustment` (ISSUE-006): body `{ direction: CREDIT\|DEBIT, amount: int ≥1, note }`; response `amount/balanceBefore/balanceAfter` là **string** (parse trước khi tính). Chỉ gọi khi workspace `ACTIVE`. Không có trần số tiền, không duyệt, không hoàn tác (sửa nhầm = điều chỉnh chiều ngược lại) | Dialog xác nhận hiển thị lại số tiền có phân cách hàng nghìn + owner đích; disable nút khi đang gửi; nói rõ **ví gắn với owner**, dùng chung mọi workspace của owner | Admin map 3.1; Guide 14.1 |
| 11-10 | **Giao dịch ví:** `amount` **luôn dương** với mọi `type` (kể cả trừ tiền) → hiện dấu/màu bằng cách so `balanceAfter` với `balanceBefore`. `MANUAL_ADJUSTMENT` đã được sinh thật (`sourceType: "ADMIN_ADJUSTMENT"`, `note` luôn có) → map nhãn và cho lọc `?type=MANUAL_ADJUSTMENT`. `REVERSAL` chưa có code nào sinh ra | Sửa logic dấu/màu; thêm nhãn `MANUAL_ADJUSTMENT` | Guide mục wallet |

---

Khi hoàn tất, gửi BE: commit/deploy, kết quả smoke test và các chỗ guide cần chỉnh.
