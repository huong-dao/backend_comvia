# FE — Log tin gửi thất bại (2026-11-23)

Mọi tin gửi thất bại giờ đều có log kèm **lý do** và **thời gian gửi**. Không đổi endpoint, tên field hay HTTP status; chỉ khác dữ liệu trả về. Đã lên production. Contract gốc: [API guide](../FRONTEND_API_GUIDE_NEXTJS.mdc) mục 8.1, 8.2, 9B.6, 12, analytics và campaign (đã cập nhật). Nếu có chỗ lệch, guide thắng.

---

## 1. Tóm tắt cho người vội

| Màn hình | Trước | Giờ | FE cần làm |
|---|---|---|---|
| Danh sách log (`GET /workspaces/:workspaceId/messages/logs`) | Tin lỗi không có `sentAt`, `errorCode` là message thô; lỗi chặn trước khi gọi Zalo không có log | Mọi tin lỗi có dòng `FAILED` với `sentAt` và `errorCode = "<CODE>: <chi tiết>"` | Hiển thị lý do + giờ; sẽ thấy nhiều dòng `FAILED` hơn |
| Gửi đơn (`POST …/messages/send-single`) | `messageLogId` chỉ có khi lỗi từ Zalo | `messageLogId` có ở mọi lỗi (trừ khi `templateId` không tồn tại) | Link tới dòng log nếu có `messageLogId` |
| Dòng campaign (`GET …/campaigns/:id/rows`) | `failureReason` là chuỗi thô, chỉ có ở dòng `FAILED` | `FAILED` dạng `"<CODE>: …"`; dòng `PENDING` đang chờ do campaign pause cũng có `failureReason` | Đừng tô đỏ dòng `PENDING` chỉ vì có `failureReason` |
| Dashboard (`GET …/analytics/overview`) | `successRate` luôn ra 100% | `successRate` tính đúng; `messagesSent` chỉ đếm tin thành công | Không đổi code; số liệu sẽ khác |

---

## 2. Log tin nhắn

`GET /workspaces/:workspaceId/messages/logs` — shape không đổi, các giá trị dưới đây thay đổi.

**Tin `FAILED`:**
- `sentAt`: thời điểm thử gửi, luôn có. Danh sách sắp theo `sentAt` giảm dần, nên tin lỗi giờ nằm đúng chỗ (trước đây `sentAt = null` làm chúng nổi lên đầu danh sách).
- `errorCode`: `"<CODE>: <chi tiết>"`, tối đa 255 ký tự. `<CODE>` thuộc bảng ở mục 5.
- `providerMessageId`, `walletTransactionId`: `null`. Tin lỗi **không bị tính phí**: gửi đơn/Public API không trừ ví; campaign đã giữ tiền trước nên phần của dòng lỗi được hoàn khi run kết thúc. `costAtTime` của tin lỗi gửi đơn/Public API là `null`, của tin lỗi campaign là đơn giá đã giữ, nên **đừng cộng `costAtTime` của tin `FAILED` vào chi phí**.

**Ví dụ `errorCode`:**

| `errorCode` | Ý nghĩa |
|---|---|
| `OA_NOT_CONNECTED: Official Account chưa kết nối với Zalo. Vui lòng kết nối OA trong phần Cài đặt.` | OA chưa kết nối |
| `INSUFFICIENT_CREDIT: Số dư không đủ để gửi tin. Vui lòng nạp thêm tiền.` | Thiếu số dư |
| `SUBSCRIPTION_EXPIRED: Gói subscription của workspace đã hết hạn. …` | Hết hạn gói |
| `ZALO_REJECTED: Template is not approved` | Zalo từ chối, phần sau dấu `:` là nguyên văn từ Zalo (tiếng Anh) |
| `SEND_FAILED: socket hang up` | Lỗi khác (mạng, hệ thống) |

**Cách đọc:**
```ts
// Tách theo dấu ": " ĐẦU TIÊN. Phần chi tiết có thể chứa thêm dấu ":".
function parseFailure(errorCode: string | null) {
  if (!errorCode) return null;
  const i = errorCode.indexOf(': ');
  return i < 0
    ? { code: 'SEND_FAILED', detail: errorCode }   // log cũ: message thô, không có mã
    : { code: errorCode.slice(0, i), detail: errorCode.slice(i + 2) };
}
```
- Log cũ (trước 2026-11-23) có `errorCode` là message thô, không có tiền tố mã → xử lý như trên.
- Với `code` đã biết, ưu tiên hiển thị câu tiếng Việt của FE; chỉ dùng `detail` để tra cứu hoặc hiển thị phụ. `ZALO_REJECTED` và `SEND_FAILED` có `detail` là tiếng Anh/kỹ thuật, không nên đưa thẳng cho người dùng cuối.
- Lọc `?status=FAILED` để xem riêng tin lỗi.

**Dữ liệu cũ:** log `FAILED` có từ trước đã được backfill `sentAt = createdAt` bằng migration, nên giờ gửi của chúng là thời điểm ghi nhận lỗi.

**Tin `PENDING` của campaign (cần đối soát):** cũng có `sentAt` và `errorCode` (ví dụ `SEND_FAILED: socket hang up`). Đây là tin chưa rõ kết quả, không phải lỗi chắc chắn.

---

## 3. Gửi đơn — `POST /workspaces/:workspaceId/messages/send-single`

Body lỗi (`400`) vẫn là `{ code, message, detail? }`. **Mới:** có `messageLogId` ở mọi lỗi:

```json
{
  "code": "OA_NOT_CONNECTED",
  "message": "Official Account chưa kết nối với Zalo. Vui lòng kết nối OA trong phần Cài đặt.",
  "messageLogId": "MESSAGE_LOG_ID"
}
```

- Trước đây `messageLogId` chỉ có khi lỗi xảy ra sau khi gọi Zalo. Giờ có cả với lỗi chặn trước: `TEMPLATE_NOT_APPROVED`, `TEMPLATE_NOT_SYNCED`, `OA_NOT_CONNECTED`, `WORKSPACE_INACTIVE`, `WALLET_NOT_INITIALIZED`, `INSUFFICIENT_CREDIT`, `SUBSCRIPTION_REQUIRED`, `SUBSCRIPTION_EXPIRED`.
- **Ngoại lệ:** nếu `templateId` không tồn tại trong workspace, vẫn trả `TEMPLATE_NOT_APPROVED` nhưng **không có `messageLogId`** (không có mẫu để gắn log). Đừng giả định field luôn có.
- Mọi code và `message` giữ nguyên, nên xử lý lỗi hiện có không cần đổi.

---

## 4. Campaign

`GET /workspaces/:workspaceId/campaigns/:campaignId/rows` — shape không đổi. `failureReason` thay đổi:

| Trạng thái dòng | `failureReason` |
|---|---|
| `FAILED` | `"<CODE>: <chi tiết>"`, ví dụ `"ZALO_REJECTED: Template is not approved"`. Dòng `FAILED` cũ vẫn là chuỗi thô |
| `RECONCILIATION_REQUIRED` | `"Dispatch outcome requires reconciliation: <CODE>: <chi tiết>"` |
| `PENDING` khi campaign `PAUSED` vì OA/subscription | **Mới:** lý do đang chờ, ví dụ `"OA_NOT_CONNECTED: …"`, `"OA_TOKEN_EXPIRED: …"`, `"SUBSCRIPTION_EXPIRED: …"` |
| `PENDING` bình thường, `SUCCESS` | `null` |

Lưu ý:
- **Dòng `PENDING` có `failureReason` không phải lỗi.** Dòng chưa bị thử gửi và sẽ được gửi sau khi `resume`. Hiển thị như ghi chú "Đang chờ: …" (màu trung tính/cảnh báo nhẹ), không tính vào số dòng thất bại. Đếm thất bại theo `status`, không theo `failureReason != null`.
- Khi owner `resume`, `failureReason` của các dòng `PENDING` được xóa (`null`).
- Campaign bị pause vì OA/subscription **không tạo `MessageLog`** cho các dòng đang chờ (chưa gửi nên chưa có log). Lý do nằm ở `failureReason` của dòng và `pauseReason` của campaign. Hành vi này không đổi so với trước.
- Lỗi chặn ở `execute`/`retry`/`resume` (ví dụ `SUBSCRIPTION_EXPIRED` khi gọi API) không tạo log, vì chưa có tin nào được thử gửi.
- `messageLog.errorCode` trong từng dòng cũng dùng dạng `"<CODE>: …"` như mục 2.

---

## 5. Bảng `<CODE>`

| `<CODE>` | Khi nào |
|---|---|
| `TEMPLATE_NOT_APPROVED` | Mẫu chưa được duyệt |
| `TEMPLATE_NOT_SYNCED` | Mẫu chưa đồng bộ với Zalo |
| `OA_NOT_CONNECTED` | OA chưa kết nối |
| `OA_TOKEN_MISSING` | Thiếu token OA |
| `OA_TOKEN_EXPIRED` | Token OA hết hạn, cần kết nối lại |
| `WORKSPACE_INACTIVE` | Workspace bị khóa |
| `WALLET_NOT_INITIALIZED` | Ví chưa khởi tạo |
| `INSUFFICIENT_CREDIT` | Không đủ số dư |
| `SUBSCRIPTION_REQUIRED` | Workspace chưa có gói |
| `SUBSCRIPTION_EXPIRED` | Gói hết hạn |
| `ZALO_REJECTED` | Zalo từ chối (detail = nguyên văn Zalo) |
| `SEND_FAILED` | Lỗi khác (detail = thông tin kỹ thuật) |

FE nên có fallback cho `<CODE>` lạ: hiển thị "Gửi tin thất bại" + `detail`.

---

## 6. Dashboard — `GET /workspaces/:workspaceId/analytics/overview`

Shape không đổi, ngữ nghĩa số liệu thay đổi:
- `messagesSent`: chỉ đếm tin **thành công** (`SUCCESS`). Tin `FAILED`/`PENDING` không tính.
- `successRate`: `SUCCESS / (SUCCESS + FAILED)`. Trước đây luôn ra 100% vì tin lỗi không có `sentAt`; giờ tính đúng. Các kỳ cũ cũng đổi vì dữ liệu cũ đã được backfill, nên **số ở dashboard sẽ thấp hơn trước**. Đây là đúng, không phải lỗi.
- Không cần đổi code FE. Nếu có nhãn giải thích số liệu, ghi "Tin gửi thành công".

---

## 7. Public API (khách tích hợp bằng API key)

Không phải màn hình FE, nhưng cần báo cho bên đang tích hợp: `POST /public/messages/send`
- Lỗi chặn trước khi gọi Zalo giữ nguyên `message` tiếng Anh (`"OA is not connected"`, `"Insufficient credit"`, …), **thêm** `code` (bảng mục 5) và `messageLogId`.
- Lỗi từ Zalo giữ nguyên `{ message, messageLogId }`.
- Client cũ không bị ảnh hưởng.

---

## 8. Checklist nghiệm thu

- [ ] Danh sách log: tin `FAILED` có giờ gửi và nằm đúng thứ tự thời gian.
- [ ] Cột lý do hiển thị được `errorCode` mới và cả log cũ (không có tiền tố mã).
- [ ] Gửi thử với OA ngắt kết nối: UI báo lỗi, có `messageLogId`, và dòng log mới xuất hiện trong danh sách.
- [ ] Gửi với `templateId` sai: UI báo lỗi, không crash khi thiếu `messageLogId`.
- [ ] Campaign đang `PAUSED` do OA: dòng `PENDING` hiện ghi chú chờ, không bị tính vào số dòng lỗi.
- [ ] Sau `resume`, ghi chú chờ biến mất.
- [ ] Dashboard hiển thị `successRate` thấp hơn 100% mà không báo lỗi giao diện.

Khi hoàn tất, gửi BE: commit/deploy, kết quả smoke test và các chỗ guide cần chỉnh.
