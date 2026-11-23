# ISSUE-010: Subscription kỳ chưa bắt đầu (`UPCOMING`) — trạng thái hiển thị và mã lỗi gửi tin không nhất quán

**Trạng thái:** Mới
**Phân loại:** Missing Spec
**Module liên quan:** Module 15 — Subscription (BR-SUB-02, BR-SUB-04, BR-SUB-05); Module 3 — Messaging / Public API / Campaign (điểm chặn gửi tin, BR-CORE-10)

## Mô tả gốc từ khách hàng/PO

Không có báo cáo trực tiếp từ khách hàng/PO. Issue phát sinh khi đối chiếu docs FE (`FRONTEND_API_GUIDE_NEXTJS.mdc` mục 9B) với DTO/controller/service của SUB-01 (đối chiếu ngày 2026-11-23): với workspace chỉ có kỳ subscription có `startsAt` ở tương lai, hai API cho hai kết luận khác nhau.

## Rule hiện tại

- `BR-SUB-02`: "Workspace 'đang có hạn' khi tồn tại kỳ `ACTIVE` với `startsAt ≤ now < endsAt`." và "Trạng thái hiển thị: `NONE` (chưa từng có gói), `ACTIVE`, `EXPIRED`."
- `BR-SUB-04`: "Không có gói → lỗi `SUBSCRIPTION_REQUIRED`; hết hạn → `SUBSCRIPTION_EXPIRED`."
- `BR-SUB-05`: Admin cấp tay một kỳ và sửa ngày bắt đầu / ngày hết hạn của một kỳ.

Không rule nào định nghĩa trường hợp **có kỳ nhưng kỳ chưa tới `startsAt`** (không phải "chưa từng có gói", cũng chưa phải "hết hạn"). Không trích dẫn được rule cụ thể bị vi phạm → phân loại Missing Spec, không phải Bug.

## Hành vi thực tế đã verify

Kịch bản: workspace không có kỳ nào khác, Admin cấp tay (`POST /admin/workspaces/:workspaceId/subscriptions`) hoặc sửa một kỳ với `startsAt` ở tương lai. Kỳ `status = ACTIVE`, `startsAt > now`.

- `GET /subscriptions/current` → `SubscriptionAccessService.getStatus` (`src/subscriptions/subscription-access.service.ts:41-61`): `current` chỉ lấy kỳ có `startsAt <= now && endsAt > now` → không có; `expiredAt` chỉ lấy kỳ có `endsAt <= now` → không có. Kết quả: `status: "NONE"`, `canSend: false`, `plan: null`, `startsAt/endsAt: null`. Response **không có field nào** báo về kỳ sắp tới.
- API gửi tin (single, campaign execute/retry/resume, Public API) → `assertCanSend` (`subscription-access.service.ts:96-110`): `canSend()` false → `hasAny` = có bất kỳ kỳ `ACTIVE` nào (không xét thời gian) → true → ném `SUBSCRIPTION_EXPIRED` ("Gói subscription của workspace đã hết hạn...").
- Kết quả: banner theo `/current` nói "chưa đăng ký" (`NONE`), nhưng lỗi khi gửi tin nói "đã hết hạn" — thông báo sai sự thật vì gói chưa từng chạy.
- Worker campaign (`src/campaigns/campaigns.service.ts:788-794`) dùng `canSend()`; kỳ chưa bắt đầu → campaign `PAUSED` với `pauseReason=SUBSCRIPTION_EXPIRED` — cùng sai lệch về lý do.
- Phía Admin (`src/subscriptions/admin-subscriptions.service.ts:45-50`) đã có `state = UPCOMING` cho kỳ này — chỉ phía workspace là không phân biệt.
- Kịch bản có kỳ đã hết hạn + kỳ `UPCOMING`: `/current` trả `EXPIRED` và gửi tin trả `SUBSCRIPTION_EXPIRED` → nhất quán, không bị ảnh hưởng.
- Kỳ `CANCELLED` không tính (`status: 'ACTIVE'` ở cả hai chỗ) → nhất quán.
- Kỳ `UPCOMING` chỉ tạo được qua Admin. Mua qua Pay2S luôn bắt đầu từ kỳ cuối hết hạn hoặc từ lúc thanh toán (`computeSubscriptionPeriod`, gọi ở `src/subscriptions/subscription-purchases.service.ts:115-119` và grant tại `admin-subscriptions.service.ts:175-179`); nếu chưa có kỳ nào thì bắt đầu ngay, nên owner tự mua không rơi vào kịch bản này.
- Không có test cho kịch bản này: `subscription-access.service.spec.ts` không có case nào về kỳ có `startsAt` tương lai.

## Hành vi mong đợi

(Đề xuất, chờ PO/SA duyệt — xem Hướng xử lý.) Với workspace chỉ có kỳ chưa bắt đầu:
- Trạng thái hiển thị và mã lỗi gửi tin phải **cùng một kết luận**, và không được nói "hết hạn" khi gói chưa từng chạy.
- FE nên biết có kỳ sắp bắt đầu để hiển thị đúng (ví dụ "Gói sẽ có hiệu lực từ dd/mm") thay vì "chưa đăng ký".

## Phân tích tác động

- **Module 15:** sửa `getStatus` và/hoặc `assertCanSend`; bổ sung rule vào BR-SUB-02/BR-SUB-04.
- **API contract với FE:** `GET /subscriptions/current` — thêm field là additive; thêm giá trị mới cho `status` là breaking cho FE nếu FE đã code enum 3 giá trị (FE chưa tích hợp, chi phí đổi thấp nếu quyết sớm). Docs FE 9B.2/9B.6 đang ghi hành vi hiện tại kèm chú "chờ BE xác nhận".
- **Module Messaging/Public API/Campaign:** đổi mã lỗi khi chỉ có kỳ tương lai từ `SUBSCRIPTION_EXPIRED` sang mã khác (hoặc giữ) → ảnh hưởng Public API client nếu có tích hợp phân biệt theo `code`. Mức độ rủi ro thấp vì trường hợp hiếm (chỉ Admin tạo ra).
- **Campaign:** `pauseReason=SUBSCRIPTION_EXPIRED` vẫn dùng khi chưa tới ngày bắt đầu; nếu thêm lý do mới thì FE và `isAutoPaused` cần biết (hoặc tái dùng `SUBSCRIPTION_EXPIRED`/`SUBSCRIPTION_REQUIRED` cho gọn).
- **Admin:** không đổi. Tùy chọn: cảnh báo trên form cấp tay khi `startsAt` tương lai và workspace chưa có kỳ nào ("workspace chưa gửi được tin tới ngày đó").

## Giả định / Câu hỏi mở

- GIẢ ĐỊNH: kịch bản hiếm (chỉ qua Admin nhập `startsAt` tương lai cho workspace chưa có gói); chưa có workspace thực tế nào gặp.
- CÂU HỎI MỞ (PO): với workspace chỉ có kỳ chưa bắt đầu, người dùng thấy thông điệp nào? Đề xuất "Gói sẽ có hiệu lực từ <startsAt>" thay vì "chưa đăng ký"/"đã hết hạn".
- CÂU HỎI MỞ (PO): có cần cho phép Admin cấp kỳ `startsAt` tương lai cho workspace chưa có gói không, hay chặn/cảnh báo ở bước cấp tay?
- CẦN SA LÀM RÕ: chọn phương án đổi contract (A/B bên dưới) và mã lỗi tương ứng.

## Hướng xử lý đề xuất

Đề xuất, **chưa chốt** cho tới khi PO duyệt:

- **Phương án A (tối thiểu, không đổi contract):** khi workspace không có kỳ đang chạy và không có kỳ đã hết hạn nhưng có kỳ tương lai → `assertCanSend` ném `SUBSCRIPTION_REQUIRED` (khớp `status: NONE` của `/current`); `hasAny` đổi thành "có kỳ `ACTIVE` đã bắt đầu (`startsAt <= now`)". Thêm test.
- **Phương án B (A + thông tin cho FE):** như A, đồng thời `GET /subscriptions/current` thêm field additive `upcoming: { startsAt, endsAt, plan } | null` (kỳ gần nhất chưa bắt đầu) để FE hiển thị "có hiệu lực từ ...". Không thêm giá trị mới cho `status`.
- **Phương án C (thêm `status: "UPCOMING"`):** rõ nghĩa nhất nhưng breaking enum 3 giá trị của FE; chỉ chọn nếu FE chưa tích hợp. Cần thêm mã lỗi hoặc dùng chung `SUBSCRIPTION_REQUIRED` kèm `message` riêng.
- Khuyến nghị: **B**. Sau khi PO duyệt: cập nhật BR-SUB-02 (định nghĩa trạng thái khi chỉ có kỳ tương lai) và BR-SUB-04 (mã lỗi), ghi `change-log.md`, đồng bộ lại `FRONTEND_API_GUIDE_NEXTJS.mdc` mục 9B.2/9B.6 và bỏ chú "chờ BE xác nhận".

## Xử lý

- Rule: _chờ PO duyệt, sau đó cập nhật BR-SUB-02 / BR-SUB-04 và `change-log.md`._
- Docs FE: `docs/FRONTEND_API_GUIDE_NEXTJS.mdc` mục 9B.2 đã ghi hành vi hiện tại (kèm chú "đang chờ BE xác nhận").
- Ticket: _chờ SA chọn phương án, sau đó Team Lead chẻ ticket._
