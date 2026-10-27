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

## BE-07 — source code ready; chỉ test gửi tin ở giai đoạn hiện tại

1. `SUCCESS` vẫn chỉ nghĩa Zalo trả `error = 0` và cấp `msg_id`/bắt đầu xử lý gửi; **không** tự nghĩa là người nhận đã nhận tin trên thiết bị.
2. BE sanitize default/supplied `tracking_id` thành chữ/số, giới hạn 48 ký tự; default là `zns` thay vì `send_invoice`.
3. `MessageLog` lưu `providerTrackingId`, `providerSentAt`, `providerQuotaDaily`, `providerQuotaRemaining` và `providerDeliveredAt`.
4. `POST /webhooks/zalo-zns/delivery` là endpoint server-to-server dự phòng cho **relay tin cậy**, không phải FE. Nó yêu cầu `Authorization: Bearer <ZALO_ZNS_WEBHOOK_TOKEN>`, đối chiếu `app_id`, OA sender, `msg_id`, tracking ID với log ban đầu, rồi lưu event bất biến unique `(msg_id, user_received_message)`. Retry trả thành công idempotent.

Tài liệu Zalo công khai xác định event và payload nhưng không mô tả chữ ký callback. Comvia không kiểm soát relay `id.onweb.asia`, nên theo quyết định vận hành ngày 2026-10-27: **không bật webhook delivery và chỉ test gửi tin**. Không được trỏ webhook Zalo trực tiếp vào endpoint này hoặc thêm bearer qua reverse proxy đơn thuần.

## Hợp đồng FE hiện tại

- Chỉ hiển thị `SUCCESS` là **“Zalo đã tiếp nhận yêu cầu gửi”**.
- Có thể đọc `providerMessageId`, `providerTrackingId`, `providerSentAt` và quota snapshot từ Message Logs sau test gửi.
- Không hiển thị **“Đã nhận trên thiết bị”**, delivery/read hoặc quota UI như dữ liệu live. `providerDeliveredAt` chưa được Zalo cập nhật trong giai đoạn này.
- Không gửi request đến webhook, không poll quota riêng và không đưa secret vào browser.

## Quyết định tương lai và next action

Khi hệ thống gửi tin ổn định và có quyền quản lý đường webhook, tạo ticket vận hành mới để chuyển các webhook Zalo cần dùng về Comvia. Trước khi bật, phải xác nhận cơ chế xác thực chính thức từ Zalo; sau đó cấu hình relay/adapter an toàn, set `ZALO_ZNS_WEBHOOK_TOKEN` ngoài source, smoke `delivery_time` và duplicate callback. Không xem việc pull code/migrate do user báo là live verification của webhook.
