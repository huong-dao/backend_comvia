# FE handoff — Subscription (SUB-01) — 2026-11-23

File này chỉ chứa **trạng thái, nghiệm thu, câu hỏi mở và thứ tự làm**. Chi tiết API, shape, lỗi, Admin: xem [fe-quickref-2026-11-23.md](./fe-quickref-2026-11-23.md) (phần A). Contract gốc, nếu lệch thì guide thắng và báo BE:

- [Frontend API guide](../FRONTEND_API_GUIDE_NEXTJS.mdc) — mục **9B** (workspace), 8.1 (lỗi gửi tin), 9.3–9.4 (tài khoản ngân hàng, topup), mục campaign.
- [Admin router map](../FRONTEND_ADMIN_ROUTER_API_MAP.mdc) — mục **8A**.
- Rule: BR-SUB-01 → BR-SUB-06, BR-CORE-10 trong [business-rules.md](../business/business-rules.md).

Không tự thêm endpoint, field, quyền hay state ngoài guide. Câu hỏi về contract gửi lại BE theo [PO-to-FE handoff](../planning/po-to-fe-handoff.md).

## Trạng thái BE

Theo [board.md](../tickets/board.md), ticket SUB-01 (cập nhật 2026-11-23):

- **Đã deploy lên server** (dev xác nhận): toàn bộ API subscription (workspace và Admin) đã có; `prisma migrate status` trên server báo schema up to date. Smoke test mua gói trên Pay2S thật **chưa làm**.
- **Chưa deploy:** mã lỗi `PAY2S_UNAVAILABLE` và timeout 15 giây khi tạo QR nằm trong đợt thay đổi tiếp theo. Cho tới khi đợt đó lên server, lỗi tạo QR trả `400` dạng chuỗi tiếng Anh ("Failed to create Pay2S collection request: …") — FE xử lý cả hai dạng.
- **Chặn gửi tin đã bật trên server và không backfill:** workspace chưa có gói không gửi được tin. Admin phải tạo gói và cấp cho workspace đang chạy.

## Nghiệp vụ trong 8 dòng

1. Subscription tính theo **workspace**; mỗi kỳ có `startsAt`, `endsAt`; một workspace có thể có nhiều kỳ.
2. Owner đăng ký xong vẫn dùng mọi chức năng. **Chỉ thao tác gửi tin** bị chặn khi chưa có gói hoặc hết hạn: gửi đơn lẻ, chạy/retry/resume campaign, Public API.
3. Gói do Admin tạo: tên, mô tả, giá **chưa VAT**, % VAT, thời hạn theo **năm** (1–20). Các gói chỉ khác thời hạn, không có nâng/hạ cấp.
4. Tổng phải trả = `priceExclVat + round(priceExclVat × vatPercent / 100)`; server đã tính sẵn `vatAmount`, `totalAmountInclVat`.
5. Chỉ `OWNER` mua: chọn gói + tài khoản ngân hàng → QR Pay2S → poll trạng thái đơn.
6. Mua gói **không cộng ví**; backend tạo Order `type = "SUBSCRIPTION"`.
7. **Mua khi còn hạn thì cộng dồn** (kỳ mới bắt đầu khi kỳ cuối hết hạn); hết hạn rồi thì bắt đầu từ lúc thanh toán thành công.
8. Bật chặn ngay, **không có gói miễn phí tự động**. Workspace cũ gửi được tin chỉ khi Admin cấp tay hoặc owner mua gói.

## Banner gợi ý theo `GET /subscriptions/current`

| `status` | `canSend` | Banner gợi ý |
|---|---|---|
| `NONE` | `false` | "Workspace chưa đăng ký gói" + nút mua |
| `ACTIVE` | `true` | Nếu `daysRemaining` ≤ ngưỡng (gợi ý 7): "Gói sắp hết hạn" + nút gia hạn |
| `EXPIRED` | `false` | "Gói đã hết hạn từ `expiredAt`" + nút gia hạn |

Đây là gợi ý UX, không phải contract.

## Email (backend tự gửi, không có API)

- Subscription còn ≤ N ngày (N = `subscriptionExpiryReminderDays`): gửi owner, mỗi kỳ một lần, không nhắc nếu đã mua cộng dồn kỳ nối tiếp. Link `COMVIA_APP_BASE_URL/app/subscription`.
- Ví sắp hết: link `COMVIA_APP_BASE_URL/app/wallet`.
- FE chỉ cần có hai route `/app/subscription` và `/app/wallet`.

---

## Acceptance criteria

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

## Câu hỏi mở / rủi ro

| # | Nội dung | Ảnh hưởng FE |
|---|---|---|
| 1 | **ISSUE-010** — kỳ `UPCOMING`: `/current` trả `NONE` nhưng gửi tin trả `SUBSCRIPTION_EXPIRED`; có thể thêm field `upcoming` | Banner chỉ dựa `status` của `/current`; chờ BE xác nhận trước khi làm UI "gói sẽ có hiệu lực từ …" |
| 2 | `redirectUrl` (`/subscription/success`, `/topup/success`) backend gửi Pay2S: luồng QR không dùng, chưa xác nhận Pay2S có redirect không | Không chặn FE. BE có thể xác nhận với Pay2S rồi bỏ hoặc giữ |
| 3 | PO chưa chốt có chặn ngay ở bước Admin tạo gói khi tổng < 10.000đ | Hiện chỉ chặn lúc mua; FE nên cảnh báo ở form |
| 4 | **Rủi ro release:** bật chặn ngay, không backfill. Mọi workspace hiện có **không gửi được tin** cho tới khi Admin tạo gói và cấp tay hoặc owner mua | Màn Admin "cấp tay" phải xong sớm |
| 5 | Pay2S trên live là **thanh toán thật** (không còn sandbox): test mua gói là chuyển khoản thật | QA dùng gói test giá thấp (tổng ≥ 10.000đ), tắt gói sau khi test |

---

## Thứ tự làm đề xuất

1. Route + helper gọi API (header `x-workspace-id`, xử lý lỗi theo `code`), enum/type (quickref A7).
2. Admin: gói → cấp tay → danh sách/sửa subscription → cấu hình chung (cần có sớm để cấp cho workspace cũ).
3. Workspace: `/current` + banner → danh sách gói → mua + QR + poll (ngay trên `/app/subscription`) → lịch sử.
4. Chặn gửi tin: xử lý `SUBSCRIPTION_*` ở send-single/campaign; `pauseReason = SUBSCRIPTION_EXPIRED`.
5. `PAY2S_UNAVAILABLE` cho cả topup.
6. Smoke test trên môi trường đã deploy cùng BE (câu hỏi mở dòng 4 và 5).

Khi hoàn tất, gửi BE: commit/deploy, kết quả smoke test và các chỗ guide cần chỉnh.
