# SUB-01 — theo dõi luồng mua gói (thay cho smoke test)

Quyết định 2026-11-23: **không chạy smoke test mua gói trên Pay2S thật**. Luồng `QR → webhook → PAID → kỳ subscription + Order` chưa từng chạy với Pay2S thật; unit test chỉ mock Pay2S. Để bù, theo dõi các dấu hiệu dưới đây cho tới khi quan sát được **ít nhất một đơn `PAID` thật** (xem "Điều kiện kết thúc").

Nếu có khách báo "đã chuyển tiền mà chưa có gói" thì xử lý theo mục "Khi có bất thường".

## 1. Đơn kẹt `PENDING`

Chạy định kỳ (gợi ý vài lần mỗi ngày trong những ngày đầu), trên DB `comvia_db`:

```sql
SELECT "purchaseCode", status, "amountInclVat", "workspaceId", "createdAt"
FROM "SubscriptionPurchase"
WHERE status = 'PENDING' AND "createdAt" < now() - interval '30 minutes'
ORDER BY "createdAt" DESC;
```

- Đơn `PENDING` quá 30 phút là **đáng nghi**, chưa chắc là lỗi (khách có thể chưa chuyển tiền). Đối chiếu với sao kê ngân hàng nhận tiền.
- Đơn `PENDING` không tự hết hạn, nên danh sách sẽ dài dần; chỉ cần để ý đơn mới.

## 2. Log webhook của Pay2S

Mọi dòng log lỗi của webhook đều chứa `Pay2S IPN` hoặc `Pay2S WebHook`; lỗi tạo QR (sau khi deploy `6e38526`) chứa `collection link`. Lọc log của app (lệnh xem log tùy cách chạy app: pm2, systemd, docker):

```bash
<lệnh xem log> | grep -E "Pay2S|collection link"
```

Các dòng cần chú ý:

| Dòng chứa | Ý nghĩa |
|---|---|
| `chữ ký không hợp lệ` | Sai `api_secret` hoặc Pay2S ký khác dự kiến |
| `token xác thực không hợp lệ` | `PAY2S_WEBHOOK_TOKENS` không khớp token Pay2S gửi |
| `không tìm thấy đơn subscription` | Mã đơn trong callback không có trong DB |
| `nội dung đơn subscription lỗi` | Nội dung chuyển khoản (`COMVIASUB…`) sai định dạng |
| `số tiền không khớp` | Khách chuyển sai số tiền; đơn không được xử lý |
| `Tạo collection link thất bại` | Lỗi lúc tạo QR, chỉ có sau khi deploy `6e38526` (kèm `kind`, `orderId`, `requestId`). Trước đó lỗi này không để lại log rõ ràng |

**Lưu ý:** luồng thành công **không ghi log**. Không thấy dòng lỗi **không** chứng minh webhook đã tới. Dấu hiệu chắc chắn duy nhất là trạng thái trong DB (mục 3).

## 3. Điều kiện kết thúc: quan sát một đơn `PAID` thật

Sau khi có khách thật mua gói, chạy:

```sql
SELECT p."purchaseCode", p.status, p."paidAt",
       o."orderCode",
       ws."startsAt", ws."endsAt"
FROM "SubscriptionPurchase" p
LEFT JOIN "Order" o ON o."subscriptionPurchaseId" = p.id
LEFT JOIN "WorkspaceSubscription" ws ON ws."purchaseId" = p.id
WHERE p.status = 'PAID'
ORDER BY p."paidAt" DESC
LIMIT 5;
```

Đạt khi một đơn `PAID` có **cả** `orderCode` và `startsAt/endsAt` khác rỗng, và `GET /subscriptions/current` của workspace đó trả `ACTIVE`. Từ lúc đó luồng đã được chứng minh trên môi trường thật; có thể ngừng theo dõi định kỳ và ghi vào `board.md`.

Có thể xem thêm các callback đã được xử lý:

```sql
SELECT provider, source, status, "subscriptionPurchaseId", "createdAt"
FROM "PaymentCallbackLog"
WHERE "subscriptionPurchaseId" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 10;
```

## 4. Nạp ví cũng dùng chung webhook

Commit `35452c2` đã sửa lại phần rẽ nhánh webhook trong `topups.service.ts`. Nên nạp ví thử **một lần** (số tiền nhỏ) và kiểm tra topup về `PAID`, vì cùng một đường webhook.

## Khi có bất thường

Khách đã chuyển tiền nhưng đơn kẹt `PENDING`:

1. Tìm callback trong `PaymentCallbackLog` (mục 3) và trong log (mục 2) để biết webhook có tới không.
   - Không có callback: kiểm tra cấu hình Pay2S (webhook URL `${BACKEND_URL}/api/v1/webhooks/pay2s`, `PAY2S_WEBHOOK_TOKENS`, `PAY2S_API_SECRET`).
   - Có callback nhưng báo lỗi: đối chiếu bảng ở mục 2.
2. Để khách dùng được ngay: Admin **cấp tay** gói cho workspace (`POST /admin/workspaces/:workspaceId/subscriptions`), ghi `note` có mã đơn.
3. **Cảnh báo:** nếu sau đó webhook thật sự tới và đơn vẫn `PENDING`, hệ thống sẽ tạo kỳ và Order cho đơn đó, khiến khách có **hai kỳ** (cộng dồn). Hiện chưa có công cụ đánh dấu một đơn là "đã xử lý tay". Ghi lại mã đơn đã cấp tay để Admin chỉnh `endsAt` về đúng nếu xảy ra.
