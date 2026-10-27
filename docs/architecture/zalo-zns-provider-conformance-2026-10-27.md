# Zalo ZNS provider conformance — 2026-10-27

## Nguồn đối chiếu

- [Zalo Business Message — Gửi tin qua API](https://zalo.solutions/business-message/guidelines/gui-api)
- [Zalo for Developers — API gửi tin qua số điện thoại](https://developers.zalo.me/docs/zbs-template-message/gui-tin-template-qua-sdt/api-gui-tin-qua-sdt/api-gui-tin)

Zalo yêu cầu `POST https://business.openapi.zalo.me/message/template`, header `access_token`, và body gồm `phone`, `template_id`, `template_data`, `tracking_id`. Số điện thoại dùng mã quốc gia (`84...`); template phải được duyệt; `tracking_id` tối đa 48 ký tự và không chứa ký tự đặc biệt. Response `error = 0` trả `msg_id`, `sent_time` và có thể có quota. Sự kiện `user_received_message` mới xác nhận người nhận đã nhận trên thiết bị.

## Kết luận audit source (không phải live verification)

| Luồng Comvia | Đường gọi Zalo                                              | Kết luận                                                                           |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Single       | `MessagingService` → `OaMessagingService` → `ZaloZnsClient` | Đã tích hợp transport.                                                             |
| Public API   | `PublicApiService` → `OaMessagingService` → `ZaloZnsClient` | Đã tích hợp transport.                                                             |
| Campaign     | Worker row → `OaMessagingService` → `ZaloZnsClient`         | Đã tích hợp transport; campaign dùng tracking ID là row ID và cơ chế at-most-once. |

`ZaloZnsClient` gửi đúng endpoint/header/body, chuẩn hóa số `0xxxxxxxxx` thành `84xxxxxxxxx`, bắt buộc template có `providerTemplateId`, và lấy/refresh token OA qua `OaTokenService`. Không có OA token, template approved, hạn mức thực hay tin nhắn nào được gửi để chứng minh live behavior trong audit này.

## BE-07 — code ready on `dev2`, deploy pending

1. `SUCCESS` vẫn chỉ nghĩa Zalo trả `error = 0` và cấp `msg_id`/bắt đầu xử lý gửi; **không** tự nghĩa là người nhận đã nhận tin trên thiết bị.
2. BE sanitize default/supplied `tracking_id` thành chữ/số, giới hạn 48 ký tự; default là `zns` thay vì `send_invoice`.
3. `MessageLog` lưu `providerTrackingId`, `providerSentAt`, `providerQuotaDaily`, `providerQuotaRemaining` và `providerDeliveredAt`.
4. `POST /webhooks/zalo-zns/delivery` là endpoint server-to-server của **relay tin cậy**, không phải FE. Nó yêu cầu `Authorization: Bearer <ZALO_ZNS_WEBHOOK_TOKEN>`, đối chiếu `app_id`, OA sender, `msg_id`, tracking ID với log ban đầu, rồi lưu event bất biến unique `(msg_id, user_received_message)`. Retry trả thành công idempotent.

Tài liệu Zalo công khai xác định event và payload nhưng không mô tả chữ ký callback. Vì vậy không được trỏ webhook Zalo trực tiếp vào endpoint này nếu không có relay thêm bearer hoặc một cơ chế xác thực chính thức đã được Zalo xác nhận.

## Hợp đồng FE sau BE-07

- Chỉ hiển thị `SUCCESS` là **“Zalo đã tiếp nhận yêu cầu gửi”**.
- Dùng Message Logs hiện có để đọc `providerMessageId`, `providerTrackingId`, `providerSentAt`, `providerDeliveredAt`, `providerQuotaDaily`, `providerQuotaRemaining`.
- Chỉ khi `providerDeliveredAt` khác `null` mới hiển thị **“Đã nhận trên thiết bị”**. `null` là chưa có event hợp lệ, không phải lỗi gửi.
- Không gửi request đến webhook, không poll quota riêng và không đưa secret vào browser.

## Deploy/smoke next action

DevOps apply migration `20261027120000_zalo_delivery_evidence`, đặt `ZALO_ZNS_WEBHOOK_TOKEN` ở relay và backend, rồi gửi một tin thử và chuyển event delivery qua relay. Xác nhận một `MessageLog` có `providerSentAt`/quota (nếu Zalo trả về), `providerDeliveredAt` đúng `delivery_time`; gửi lại cùng event phải trả `duplicate: true` và không tạo event thứ hai.
