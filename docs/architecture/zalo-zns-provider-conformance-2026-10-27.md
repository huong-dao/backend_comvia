# Zalo ZNS provider conformance — 2026-10-27

## Nguồn đối chiếu

- [Zalo Business Message — Gửi tin qua API](https://zalo.solutions/business-message/guidelines/gui-api)
- [Zalo for Developers — API gửi tin qua số điện thoại](https://developers.zalo.me/docs/zbs-template-message/gui-tin-template-qua-sdt/api-gui-tin-qua-sdt/api-gui-tin)

Zalo yêu cầu `POST https://business.openapi.zalo.me/message/template`, header `access_token`, và body gồm `phone`, `template_id`, `template_data`, `tracking_id`. Số điện thoại dùng mã quốc gia (`84...`); template phải được duyệt; `tracking_id` tối đa 48 ký tự và không chứa ký tự đặc biệt. Response `error = 0` trả `msg_id`, `sent_time` và có thể có quota. Sự kiện `user_received_message` mới xác nhận người nhận đã nhận trên thiết bị.

## Kết luận audit source (không phải live verification)

| Luồng Comvia | Đường gọi Zalo | Kết luận |
|---|---|---|
| Single | `MessagingService` → `OaMessagingService` → `ZaloZnsClient` | Đã tích hợp transport. |
| Public API | `PublicApiService` → `OaMessagingService` → `ZaloZnsClient` | Đã tích hợp transport. |
| Campaign | Worker row → `OaMessagingService` → `ZaloZnsClient` | Đã tích hợp transport; campaign dùng tracking ID là row ID và cơ chế at-most-once. |

`ZaloZnsClient` gửi đúng endpoint/header/body, chuẩn hóa số `0xxxxxxxxx` thành `84xxxxxxxxx`, bắt buộc template có `providerTemplateId`, và lấy/refresh token OA qua `OaTokenService`. Không có OA token, template approved, hạn mức thực hay tin nhắn nào được gửi để chứng minh live behavior trong audit này.

## Khoảng trống cần xử lý — BE-07

1. `MessageStatus.SUCCESS` hiện chỉ có nghĩa Zalo trả `error = 0` và cấp `msg_id`/bắt đầu xử lý gửi; **không** có nghĩa người nhận đã nhận tin trên thiết bị.
2. Chưa có endpoint/webhook lưu event Zalo `user_received_message`, `delivery_time`, `sent_time` hoặc quota. Không có delivery state cho FE hiển thị/poll.
3. Default prefix `ZALO_ZNS_TRACKING_ID` hiện là `send_invoice`, chứa `_`; Zalo yêu cầu `tracking_id` không ký tự đặc biệt. BE phải validate/sanitize cả prefix và supplied tracking ID, giới hạn 48 ký tự, rồi thêm test.
4. Provider response đầy đủ hiện không được persist vào `MessageLog`; chỉ `providerMessageId` được lưu.

## Hợp đồng FE hiện tại

- Chỉ hiển thị `SUCCESS` là **“Zalo đã tiếp nhận yêu cầu gửi”**, không dùng nhãn “Đã giao/đã nhận”.
- `providerMessageId` là mã đối soát provider duy nhất FE có thể hiển thị/log hiện tại.
- Không dựng UI quota, delivery time, delivered/read status hoặc polling endpoint vì backend chưa phát hành contract đó.
- Khi BE-07 hoàn tất và deploy, FE sẽ nhận field/event mới qua API guide và cần thêm smoke theo `msg_id`/`tracking_id`.

## Next action

BE thực hiện BE-07: hợp thức hóa tracking ID, persist response cần thiết và chốt cơ chế xác thực/idempotency cho Zalo delivery webhook trước khi phát hành delivery/quota contract cho FE.
