# FE handoff — Subscription (SUB-01) — 2026-11-23

## Mục đích và trạng thái

Tài liệu này gom **mọi thứ FE cần để làm tính năng Subscription** (phía workspace và phía Admin) vào một chỗ. Contract chính thức vẫn là hai guide; nếu có chỗ lệch, guide thắng và hãy báo BE:

- [Frontend API guide](../FRONTEND_API_GUIDE_NEXTJS.mdc) — mục **9B** (workspace), 8.1 (lỗi gửi tin), 9.3–9.4 (tài khoản ngân hàng, topup), mục campaign.
- [Admin router map](../FRONTEND_ADMIN_ROUTER_API_MAP.mdc) — mục **8A**.
- Rule: BR-SUB-01 → BR-SUB-06, BR-CORE-10 trong [business-rules.md](../business/business-rules.md).

Trạng thái BE (theo [board.md](../tickets/board.md), ticket SUB-01):

- **Đã deploy lên server** (dev xác nhận 2026-11-23): toàn bộ API subscription ở mục 3–5 đã có. Smoke test mua gói trên Pay2S thật **chưa làm**.
- **Chưa deploy:** mã lỗi `PAY2S_UNAVAILABLE` (mục 3.3) và timeout 15 giây khi tạo QR nằm trong đợt thay đổi tiếp theo. Cho tới khi đợt đó lên server, lỗi tạo QR vẫn trả `400` dạng chuỗi tiếng Anh ("Failed to create Pay2S collection request: …") — FE nên xử lý cả hai dạng.
- **Chặn gửi tin đã bật trên server và không backfill:** workspace chưa có gói không gửi được tin. Admin phải tạo gói và cấp cho workspace đang chạy (mục 5.2, mục 9 dòng 4).

Không tự thêm endpoint, field, quyền hay state ngoài guide. Câu hỏi về contract gửi lại BE theo [PO-to-FE handoff](../planning/po-to-fe-handoff.md).

---

## 0. Nghiệp vụ trong 8 dòng

1. Subscription tính theo **workspace**. Mỗi kỳ có `startsAt`, `endsAt`; một workspace có thể có nhiều kỳ.
2. Owner đăng ký xong vẫn dùng được mọi chức năng. **Chỉ thao tác gửi tin** bị chặn khi workspace chưa có gói hoặc gói hết hạn: gửi đơn lẻ, chạy/retry/resume campaign, Public API.
3. Gói do Admin tạo: tên, mô tả, giá **chưa VAT**, % VAT, thời hạn theo **năm** (1–20). Các gói chỉ khác thời hạn, không có nâng/hạ cấp.
4. Tổng phải trả = `priceExclVat + round(priceExclVat × vatPercent / 100)` (server đã tính sẵn `vatAmount`, `totalAmountInclVat`).
5. Chỉ `OWNER` mua. Luồng như nạp ví: chọn gói + tài khoản ngân hàng → QR Pay2S → poll trạng thái đơn.
6. Mua gói **không cộng ví**; backend tạo Order `type = "SUBSCRIPTION"`.
7. **Mua khi còn hạn thì cộng dồn**: kỳ mới bắt đầu khi kỳ cuối hết hạn. Hết hạn rồi thì bắt đầu từ lúc thanh toán thành công.
8. Bật chặn ngay, **không có gói miễn phí tự động**. Workspace cũ gửi được tin chỉ khi Admin cấp tay hoặc owner mua gói.

---

## 1. Quy ước chung

| Mục | Giá trị |
|---|---|
| Base URL | `NEXT_PUBLIC_API_BASE_URL` đã gồm `/api/v1` (ví dụ `https://api.comvia.cloud/api/v1`) |
| Auth | `Authorization: Bearer <accessToken>` |
| Workspace | **Mọi route subscription phía workspace dùng header `x-workspace-id`** (giống topup), không dùng path `:workspaceId`. Thiếu header → `403`; workspace không `ACTIVE` hoặc membership không `ACTIVE` → `403`. |
| Ngoại lệ path-param | `GET /workspaces/:workspaceId/orders` (chỉ `OWNER`) và các route campaign vẫn dùng path param, **không** cần `x-workspace-id` |
| Admin | Prefix `/admin/...`, chỉ role hệ thống `ADMIN`. `STAFF` gọi sẽ bị từ chối — ẩn menu theo role |
| Validate body | Server bật `whitelist` + `forbidNonWhitelisted`: **gửi field thừa → `400`**. Chỉ gửi đúng field trong contract |
| Phân trang | `{ data: [...], meta: { page, limit, total, totalPages } }`; `limit` tối đa 100 |
| Tiền | Số (VND), ví dụ `2200000` |
| Ngày | Chuỗi ISO 8601 UTC (`2026-11-23T03:00:00.000Z`); hiển thị theo giờ Việt Nam |
| CORS | Chỉ origin `https://app.comvia.cloud`; header cho phép: `Content-Type`, `Authorization`, `x-api-key`, `x-workspace-id` |

---

## 2. Route FE phải có

| Route | Dùng cho | Nguồn |
|---|---|---|
| `/app/subscription` | Trang trạng thái + mua/gia hạn gói. **Email nhắc trỏ vào đây** | `COMVIA_APP_BASE_URL` |
| `/app/wallet` | Trang ví. Email "ví sắp hết" trỏ vào đây | `COMVIA_APP_BASE_URL` |
| `/subscription/success` | **Không bắt buộc** (xem ghi chú bên dưới) | `redirectPath` ở backend |
| Menu Admin → Subscriptions | Gói, danh sách subscription; Cấu hình chung. Path FE tự chọn (ví dụ `/admin/subscriptions`) | Admin map 8A |

Nếu FE dùng path khác cho hai route `/app/subscription` và `/app/wallet`, **báo BE đổi** (link trong email nằm ở backend).

**Về `/subscription/success` (đã đính chính):** luồng mua gói **không có bước redirect về FE**. Khách quét QR bằng app ngân hàng; Pay2S báo cho backend bằng webhook (server-to-server); FE biết kết quả bằng cách **poll** mục 3.3. Backend vẫn gửi Pay2S tham số `redirectUrl = ${FRONTEND_URL}/subscription/success` khi tạo yêu cầu (topup cũng vậy với `/topup/success`), nhưng luồng QR không dùng URL này và chưa xác nhận Pay2S có bao giờ redirect tới đó. Vì vậy route này **không bắt buộc**; nếu muốn phòng hờ thì thêm route đơn giản chuyển về `/app/subscription`. FE hãy cho biết topup hiện có `/topup/success` không, để thống nhất.

---

## 3. Màn hình phía Workspace

### 3.1 Trạng thái subscription — `GET /subscriptions/current`

Quyền: mọi member `ACTIVE`. Gọi khi vào app và khi đổi workspace; dùng cho banner và để bật/tắt nút gửi tin.

```json
{
  "status": "ACTIVE",
  "canSend": true,
  "plan": { "id": "PLAN_ID", "code": "ZBS-PRO-1A2B", "name": "ZBS PRO" },
  "startsAt": "2026-11-23T03:00:00.000Z",
  "endsAt": "2028-11-23T03:00:00.000Z",
  "daysRemaining": 730,
  "expiredAt": null
}
```

| `status` | `canSend` | Banner gợi ý |
|---|---|---|
| `NONE` | `false` | "Workspace chưa đăng ký gói" + nút mua |
| `ACTIVE` | `true` | Nếu `daysRemaining` ≤ ngưỡng (gợi ý 7): "Gói sắp hết hạn" + nút gia hạn |
| `EXPIRED` | `false` | "Gói đã hết hạn từ `expiredAt`" + nút gia hạn |

- `endsAt` đã **cộng dồn** các kỳ mua liền kề — đó là ngày hết hạn thật. `plan` và `startsAt` là của kỳ đang chạy.
- Với `NONE`/`EXPIRED`: `plan`, `startsAt`, `endsAt` là `null`, `daysRemaining` là `0`.
- **Kỳ chưa bắt đầu (`UPCOMING`):** nếu workspace chỉ có kỳ bắt đầu trong tương lai (Admin cấp tay) thì `/current` trả `NONE`, và API gửi tin trả `SUBSCRIPTION_EXPIRED`. Hành vi này đang chờ BE/PO chốt ([ISSUE-010](../business/issues/ISSUE-010-subscription-upcoming-status-inconsistent.md)) và **có thể đổi** (ví dụ thêm field `upcoming`). Hiện tại: chọn nội dung banner theo `status` của `/current`, không suy luận từ code lỗi gửi tin.

### 3.2 Danh sách gói đang bán — `GET /subscription-plans`

Quyền: mọi member `ACTIVE`. Query: `page`, `limit` (mặc định 20, tối đa 100), `keyword` (tên hoặc mã, không phân biệt hoa thường), `durationYears`. Chỉ trả gói `isActive = true`, sắp theo `sortOrder`.

```json
{
  "data": [{
    "id": "PLAN_ID", "code": "ZBS-PRO-1A2B", "name": "ZBS PRO",
    "description": "Gói 1 năm",
    "durationYears": 1,
    "priceExclVat": 2000000, "vatPercent": 10,
    "vatAmount": 200000, "totalAmountInclVat": 2200000,
    "isActive": true, "sortOrder": 0,
    "createdAt": "...", "updatedAt": "..."
  }],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

- `description` có thể `null`.
- Hiển thị đủ breakdown: giá chưa VAT, VAT (%, số tiền), **tổng**. Số khách phải chuyển khoản là `totalAmountInclVat`.

### 3.3 Mua gói (OWNER)

**Bước 1 — chọn tài khoản ngân hàng:** `GET /public/money-accounts/active-for-topup` (chỉ cần JWT, dùng chung danh sách với nạp ví, xem guide 9.3).

**Bước 2 — tạo đơn + QR:** `POST /subscriptions/purchase/create-with-pay2s`

```json
{ "planId": "PLAN_ID", "moneyAccountId": "MONEY_ACCOUNT_ID" }
```

```json
{
  "id": "PURCHASE_ID",
  "purchaseCode": "COMVIA_SUB_A1B2C3D4",
  "planId": "PLAN_ID", "planName": "ZBS PRO", "durationYears": 1,
  "amountExclVat": 2000000, "vatPercent": 10, "vatAmount": 200000, "amountInclVat": 2200000,
  "status": "PENDING",
  "qrCodeUrl": "https://<BACKEND_URL>/public/qrcodes/COMVIA_SUB_A1B2C3D4/qr_code.png",
  "paidAt": null,
  "createdAt": "...",
  "expectedStartsAt": "...", "expectedEndsAt": "..."
}
```

- `qrCodeUrl` là ảnh PNG: `<img src={qrCodeUrl} />` trực tiếp (URL gốc backend, **không** có `/api/v1`).
- `expectedStartsAt/expectedEndsAt` chỉ là **dự kiến nếu trả ngay**. Ngày thật tính lại lúc nhận tiền. Hiển thị với nhãn "dự kiến".
- Lưu `purchaseCode` (state, hoặc sessionStorage nếu muốn giữ qua reload) để poll. Hiển thị QR ngay trên trang `/app/subscription` (modal hoặc khối), không cần chuyển trang.

**Bước 3 — poll trạng thái:** `GET /subscriptions/purchases/:purchaseCode/status` (OWNER) — cùng shape như response bước 2 nhưng **không có** `expected*`. Không thấy đơn → `404`.

- Gợi ý: poll mỗi 3–5 giây, dừng khi `status` là `PAID` hoặc `FAILED`. Khi `PAID`: gọi lại `GET /subscriptions/current` và cập nhật banner. Cho phép user rời trang và xem lại ở lịch sử (3.4).
- `PENDING` → `PAID` khi Pay2S báo thanh toán thành công; → `FAILED` khi tạo QR lỗi hoặc Pay2S báo giao dịch thất bại. **Không có cơ chế tự hết hạn đơn `PENDING`**: nếu user không thanh toán, đơn vẫn `PENDING`. Tạo QR mới = tạo đơn mới.

**Lỗi tạo đơn (`400`):**

| Tình huống | Body | FE làm |
|---|---|---|
| Pay2S lỗi / timeout (15 giây) / từ chối / không có mã QR | `{ "code": "PAY2S_UNAVAILABLE", "message": "Cổng thanh toán đang bận, vui lòng thử lại sau." }` (đơn chuyển `FAILED`) | Hiện message + nút **Thử lại** (tạo đơn mới) |
| Gói không tồn tại hoặc đã ngừng bán | chuỗi thường, không có `code` | Hiện `message`, tải lại danh sách gói |
| Tổng sau VAT < 10.000đ | chuỗi thường: "Giá gói quá thấp để thanh toán qua Pay2S (tối thiểu 10.000đ)" | Hiện `message` (lỗi cấu hình gói, báo Admin) |
| Tài khoản ngân hàng không hợp lệ / thiếu `pay2sBankId` | chuỗi thường | Hiện `message`, cho chọn tài khoản khác |
| Lỗi bất ngờ (ví dụ DB) | `500` | Thông báo chung + Thử lại |

`PAY2S_UNAVAILABLE` áp dụng **cả topup** (`POST /topups/create-with-pay2s`), xử lý chung một helper.

### 3.4 Lịch sử mua (OWNER) — `GET /subscriptions/history`

Query: `page`, `limit` (mặc định 20, tối đa 100), `status` ∈ `PENDING | PAID | FAILED`. Sắp mới nhất trước.

Mỗi phần tử = shape response tạo đơn (không có `expected*`) cộng:

```json
{ "order": { "id": "ORDER_ID", "orderCode": "ORD_COMVIA_SUB_..." } , "startsAt": "...", "endsAt": "..." }
```

`order`, `startsAt`, `endsAt` là `null` khi đơn chưa thanh toán. Có thể link `order.id` sang chi tiết đơn.

### 3.5 Đơn hàng — `GET /workspaces/:workspaceId/orders`

Chỉ `OWNER`; path param (không dùng `x-workspace-id`). Trả **mảng thô** (kèm `items`), **không phân trang, không có `meta`**. Đơn subscription có `type: "SUBSCRIPTION"`, đơn nạp ví là `"TOPUP"`: hiển thị nhãn theo `type`. Member thường không thấy đơn.

---

## 4. Chặn gửi tin: xử lý lỗi và campaign

### 4.1 Mã lỗi

Các API gửi tin trả `400` với body (cùng dạng lỗi gửi tin, guide mục 8.1):

| `code` | Khi nào | `message` (hiển thị trực tiếp) |
|---|---|---|
| `SUBSCRIPTION_REQUIRED` | Workspace chưa từng có subscription | "Workspace chưa đăng ký gói subscription. Vui lòng mua gói để gửi tin." |
| `SUBSCRIPTION_EXPIRED` | Subscription đã hết hạn | "Gói subscription của workspace đã hết hạn. Vui lòng gia hạn để tiếp tục gửi tin." |

- Áp dụng cho: `POST /workspaces/:workspaceId/messages/send-single`, campaign `execute`/`retry`/`resume`, Public API `POST /public/messages/send`.
- Kiểm tra diễn ra **trước** ví nên **không** có `MessageLog`, **không** có `messageLogId`, ví không bị trừ.
- FE: hiện `message` + nút dẫn tới `/app/subscription`. Với member không phải owner: nói "liên hệ chủ workspace" (chỉ owner mua được).
- Gợi ý: disable nút gửi và hiện CTA khi `canSend = false`, nhưng **vẫn xử lý lỗi `400` từ server** vì gói có thể hết giữa chừng.

### 4.2 Campaign bị tạm dừng vì hết hạn

Campaign đang chạy mà subscription hết hạn: worker chuyển campaign `status = "PAUSED"` với `pauseReason = "SUBSCRIPTION_EXPIRED"`; các dòng chưa gửi vẫn `PENDING`, tiền đã giữ không đổi.

| `pauseReason` | Ý nghĩa | FE làm |
|---|---|---|
| `"SUBSCRIPTION_EXPIRED"` | Hết hạn gói | Báo "Gói đã hết hạn", dẫn owner tới `/app/subscription`. Nút **Tiếp tục** (`POST /workspaces/:workspaceId/campaigns/:campaignId/resume`) chỉ bật khi `GET /subscriptions/current` có `canSend = true` |
| `"OA_DISCONNECTED"` | OA mất kết nối | Dẫn user kết nối lại OA, rồi **Tiếp tục** (đã có sẵn) |
| `null` | Không phải pause tự động | Như cũ |

- `resume` **không trừ ví lần nữa**, dùng lại run cũ. Response `{ "campaignId", "status": "RUNNING", "runId" }`. Resume khi vẫn hết hạn → `400` `SUBSCRIPTION_EXPIRED`.
- `execute` trên campaign `PAUSED` do hết hạn **tự chuyển thành resume** (response của `resume`, không phải `QUEUED`).
- **`retry` và `import-csv/reconcile` trả `400` với message tiếng Anh, không có `code`** khi đang `PAUSED` do hết hạn ("Campaign is paused because the subscription expired; renew it and resume first"). **Đừng dựa vào lỗi này**: ẩn/disable Retry, Reconcile, Execute và chỉ hiện **Tiếp tục** khi `pauseReason` là `SUBSCRIPTION_EXPIRED` hoặc `OA_DISCONNECTED`.
- `pauseReason` chỉ có một giá trị tại một thời điểm. Giá trị lạ (thêm sau này): hiển thị như trạng thái `PAUSED` chung.
- Resume không tự động: sau khi gia hạn, campaign vẫn `PAUSED` đến khi user bấm Tiếp tục.

---

## 5. Màn hình Admin (role `ADMIN`)

### 5.1 Gói subscription

| API | Dùng cho |
|---|---|
| `GET /admin/subscription-plans?page&limit&keyword&isActive&durationYears` | Danh sách **mọi** gói (cả đã tắt). `limit` mặc định 20 |
| `POST /admin/subscription-plans` | Tạo gói |
| `GET /admin/subscription-plans/:planId` | Chi tiết |
| `PATCH /admin/subscription-plans/:planId` | Sửa / bật-tắt bán (`isActive`) |

Body tạo:

```json
{
  "code": "ZBS-PRO",
  "name": "ZBS PRO",
  "description": "Gói 1 năm",
  "priceExclVat": 2000000,
  "vatPercent": 10,
  "durationYears": 1,
  "isActive": true,
  "sortOrder": 0
}
```

| Field | Bắt buộc | Ràng buộc |
|---|---|---|
| `name` | có | chuỗi, ≤ 120 ký tự |
| `priceExclVat` | có | số ≥ 0 (VND, chưa VAT) |
| `vatPercent` | có | số 0–100 |
| `durationYears` | có | số nguyên 1–20 |
| `code` | không | chữ/số/`-`/`_`, 2–40 ký tự; tự sinh từ tên nếu bỏ trống; lưu chữ hoa; trùng → `409` |
| `description` | không | ≤ 500 ký tự |
| `isActive` | không | mặc định `true` |
| `sortOrder` | không | số nguyên, mặc định 0 |

- `PATCH`: mọi field tùy chọn trừ `code` (**không sửa được `code`**; gửi `code` → `400` vì field thừa). `description` chỉ đổi sang chuỗi (kể cả rỗng), không set `null`.
- Response (tạo/sửa/chi tiết/list) cùng shape 3.2, có `vatAmount` và `totalAmountInclVat`. Form nên **tính live** bằng `round(price × vat / 100)`.
- **Không có nút xoá gói**; ngừng bán bằng `isActive = false`.
- Sửa gói **không** ảnh hưởng đơn đã mua và subscription đang chạy (đơn giữ snapshot).
- **Cảnh báo form:** gói có tổng sau VAT < 10.000đ vẫn tạo được nhưng **owner không mua được** — nên cảnh báo/chặn ở form.

### 5.2 Subscription của workspace

| API | Dùng cho |
|---|---|
| `GET /admin/subscriptions` | Danh sách kỳ của mọi workspace |
| `GET /admin/subscriptions/:subscriptionId` | Chi tiết |
| `PATCH /admin/subscriptions/:subscriptionId` | Sửa gói / ngày bắt đầu / ngày hết hạn / trạng thái / ghi chú |
| `POST /admin/workspaces/:workspaceId/subscriptions` | **Cấp tay** một kỳ (không qua thanh toán) |

Query list: `page`, `limit` (mặc định 30, tối đa 100; sắp theo `endsAt` giảm dần), `workspaceId`, `keyword` (tên/slug workspace hoặc email owner), `planId`, `state` ∈ `ACTIVE | UPCOMING | EXPIRED | CANCELLED`, `endsAtFrom`, `endsAtTo` (ISO).

Mỗi phần tử (list/chi tiết/kết quả PATCH/kết quả cấp tay — cùng shape):

```json
{
  "id": "SUB_ID",
  "workspace": { "id": "...", "name": "...", "slug": "...", "status": "ACTIVE",
                 "owner": { "id": "...", "email": "...", "fullName": "..." } },
  "plan": { "id": "...", "code": "...", "name": "ZBS PRO", "durationYears": 1 },
  "orderId": "ORDER_ID | null",
  "order": { "id": "...", "orderCode": "ORD_COMVIA_SUB_..." },
  "purchaseId": "PURCHASE_ID | null",
  "source": "PURCHASE",
  "startsAt": "...", "endsAt": "...", "durationDays": 365,
  "status": "ACTIVE", "state": "ACTIVE", "daysRemaining": 300,
  "note": null, "createdAt": "...", "updatedAt": "..."
}
```

- `source`: `PURCHASE` (khách mua) hoặc `ADMIN_GRANT` (cấp tay; `order` là `null`).
- `status` là trạng thái **lưu** (`ACTIVE | CANCELLED`). `state` là trạng thái **suy ra theo thời gian** (`ACTIVE | UPCOMING | EXPIRED | CANCELLED`). Hiển thị badge theo `state`.

**Body sửa** (mọi field tùy chọn): `{ "planId", "startsAt", "endsAt", "status": "ACTIVE|CANCELLED", "note" }`
- Ngày dạng ISO; `endsAt` phải sau `startsAt`, nếu không → `400` ("Ngày hết hạn phải sau ngày bắt đầu"). Gói/subscription không tồn tại → `404`.
- `status: "CANCELLED"` = **thu hồi ngay**: workspace không gửi được tin nếu không còn kỳ khác. Nên có hộp xác nhận.
- Đổi `endsAt` sẽ reset cờ đã nhắc hết hạn (email nhắc lại theo hạn mới).
- `note` ≤ 500 ký tự.

**Body cấp tay**: `{ "planId", "startsAt"?, "endsAt"?, "note"? }`
- Bỏ trống ngày → tính như mua cộng dồn theo số năm của gói. Chỉ gửi `startsAt` → `endsAt = startsAt + số năm`.
- Workspace không tồn tại / gói không tồn tại → `404`.
- Dùng cho **workspace cũ chưa có gói**.
- Lưu ý: cấp với `startsAt` tương lai cho workspace chưa có kỳ nào thì workspace **chưa gửi được tin** tới ngày đó (xem ISSUE-010). Form nên cảnh báo.

Mọi thay đổi ghi audit log (xem được ở màn audit hiện có).

### 5.3 Cấu hình chung — `GET` / `PATCH /admin/config/general`

```json
{ "subscriptionExpiryReminderDays": 7, "walletLowBalanceThreshold": 100000 }
```

| Field | Ràng buộc |
|---|---|
| `subscriptionExpiryReminderDays` | số nguyên 1–365, mặc định 7. Số ngày trước hạn thì email nhắc owner (mỗi kỳ một lần) |
| `walletLowBalanceThreshold` | VND, ≥ 0; `0` hoặc `null` = tắt. Ví còn ≤ ngưỡng sau một giao dịch thì email nhắc owner (tối đa 1 email/ngày giờ VN) |

`PATCH` chỉ cập nhật field được gửi; response trả cấu hình hiện hành. Gửi `walletLowBalanceThreshold: null` để tắt.

### 5.4 Đơn hàng Admin

- `GET /admin/orders` thêm filter `type` ∈ `TOPUP | SUBSCRIPTION`; mỗi order có `type` và `subscriptionPurchaseId` (đơn subscription không có `topupRequestId`).
- `GET /admin/orders/:orderId` (chi tiết): với đơn `SUBSCRIPTION`, **`topupRequest = null`** — xử lý null, chọn bố cục theo `type`. `subscriptionPurchaseId` vẫn có trong bản ghi.

---

## 6. Enum và type gợi ý

```ts
type OrderType = 'TOPUP' | 'SUBSCRIPTION';
type SubscriptionPurchaseStatus = 'PENDING' | 'PAID' | 'FAILED';
type WorkspaceSubscriptionStatus = 'ACTIVE' | 'CANCELLED';           // trạng thái lưu
type SubscriptionState = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'CANCELLED'; // suy ra theo thời gian
type CurrentSubscriptionStatus = 'NONE' | 'ACTIVE' | 'EXPIRED';      // GET /subscriptions/current
type SubscriptionSource = 'PURCHASE' | 'ADMIN_GRANT';
type CampaignPauseReason = 'OA_DISCONNECTED' | 'SUBSCRIPTION_EXPIRED' | null; // giá trị lạ: xử lý như PAUSED chung
type SubscriptionSendErrorCode = 'SUBSCRIPTION_REQUIRED' | 'SUBSCRIPTION_EXPIRED';
const PAY2S_UNAVAILABLE = 'PAY2S_UNAVAILABLE'; // topup + mua gói
```

---

## 7. Email (backend tự gửi, không có API)

- Subscription còn ≤ N ngày (N = `subscriptionExpiryReminderDays`): gửi owner, mỗi kỳ một lần, không nhắc nếu đã mua cộng dồn kỳ nối tiếp. Link `COMVIA_APP_BASE_URL/app/subscription`.
- Ví sắp hết: link `COMVIA_APP_BASE_URL/app/wallet`.
- FE không làm gì thêm ngoài việc có hai route ở mục 2.

---

## 8. Acceptance criteria

**Workspace**
- [ ] Banner đúng theo `GET /subscriptions/current` cho `NONE` / `ACTIVE` (sắp hết hạn) / `EXPIRED`; gọi lại khi đổi workspace và sau khi `PAID`.
- [ ] Danh sách gói hiển thị đủ giá chưa VAT, VAT, tổng; có tìm kiếm/lọc theo năm, phân trang.
- [ ] OWNER mua được: chọn tài khoản ngân hàng → QR → poll → `PAID` cập nhật banner. Member không phải owner không thấy nút mua.
- [ ] `PAY2S_UNAVAILABLE` hiển thị thông báo + Thử lại, cho cả mua gói và topup. Các lỗi `400` thường hiển thị `message`.
- [ ] Route `/app/subscription` và `/app/wallet` tồn tại (email trỏ vào). `/subscription/success` không bắt buộc.
- [ ] Lịch sử mua có lọc `status`, hiển thị `startsAt/endsAt/order` khi `PAID`.
- [ ] Gửi đơn lẻ / campaign / (nếu có) test Public API hiển thị `message` của `SUBSCRIPTION_REQUIRED` / `SUBSCRIPTION_EXPIRED` và dẫn tới trang mua.
- [ ] Campaign `PAUSED` + `SUBSCRIPTION_EXPIRED`: hiển thị lý do, ẩn Retry/Reconcile/Execute, chỉ cho **Tiếp tục** khi `canSend = true`.
- [ ] Danh sách đơn hàng hiển thị nhãn theo `type`; không giả định có `meta`.

**Admin**
- [ ] Menu Subscriptions chỉ hiện với `ADMIN`.
- [ ] CRUD gói (không có xoá), tính live tổng tiền, cảnh báo giá < 10.000đ, không cho sửa `code`.
- [ ] Danh sách subscription có đủ filter; badge theo `state`; hiển thị `source`.
- [ ] Sửa kỳ (gói/ngày/trạng thái/ghi chú) với kiểm tra `endsAt > startsAt` và xác nhận khi `CANCELLED`.
- [ ] Cấp tay cho workspace với ngày tùy chọn.
- [ ] Cấu hình chung đọc/ghi, hỗ trợ tắt ngưỡng ví (`0`/`null`).
- [ ] Order list có filter `type`; order detail xử lý `topupRequest = null`.

---

## 9. Câu hỏi mở / rủi ro cần biết

| # | Nội dung | Ảnh hưởng FE |
|---|---|---|
| 1 | **ISSUE-010** — kỳ `UPCOMING`: `/current` trả `NONE` nhưng gửi tin trả `SUBSCRIPTION_EXPIRED`; có thể thêm field `upcoming` | Banner chỉ dựa `status` của `/current`; chờ BE xác nhận trước khi làm UI "gói sẽ có hiệu lực từ …" |
| 2 | `redirectUrl` (`/subscription/success`, `/topup/success`) backend gửi Pay2S: luồng QR không dùng, chưa xác nhận Pay2S có redirect không | Không chặn FE. BE có thể xác nhận với Pay2S rồi bỏ hoặc giữ |
| 3 | PO chưa chốt có chặn ngay ở bước Admin tạo gói khi tổng < 10.000đ | Hiện chỉ chặn lúc mua; FE nên cảnh báo ở form |
| 4 | **Rủi ro release:** bật chặn ngay, không backfill. Mọi workspace hiện có **không gửi được tin** cho tới khi Admin tạo gói và cấp tay hoặc owner mua | Màn Admin "cấp tay" phải xong trước/ngay khi deploy |
| 5 | Pay2S trên live là **thanh toán thật** (không còn sandbox): test mua gói là chuyển khoản thật | QA dùng gói test giá thấp (tổng ≥ 10.000đ), tắt gói sau khi test |

---

## 10. Thứ tự làm đề xuất

1. Route + helper gọi API (header `x-workspace-id`, xử lý lỗi `code`), enum/type (mục 6).
2. Admin: gói → cấp tay → danh sách/sửa subscription → cấu hình chung (cần có sớm để cấp cho workspace cũ khi deploy).
3. Workspace: `/current` + banner → danh sách gói → mua + QR + poll (ngay trên `/app/subscription`) → lịch sử.
4. Chặn gửi tin: xử lý `SUBSCRIPTION_*` ở send-single/campaign; `pauseReason = SUBSCRIPTION_EXPIRED`.
5. `PAY2S_UNAVAILABLE` cho cả topup.
6. Smoke test trên môi trường đã deploy cùng BE (mục 9, dòng 4 và 5).

Khi hoàn tất, gửi BE: commit/deploy, kết quả smoke test và các chỗ guide cần chỉnh.
