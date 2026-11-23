# Frontend Documentation Pack

Đây là điểm bắt đầu dành cho team FE sau khi nhận toàn bộ thư mục `docs/` từ BE.

## Bắt buộc đọc

1. [Frontend API guide](../FRONTEND_API_GUIDE_NEXTJS.mdc): API user/workspace/staff.
2. [Admin router map](../FRONTEND_ADMIN_ROUTER_API_MAP.mdc): API và route admin.
3. [Project closeout plan](../planning/project-closeout-plan.md): task hiện hành, owner và thứ tự làm.
4. [Delivery board](../tickets/board.md): trạng thái task.
5. [FE execution handoff — 2026-10-27](./fe-execution-handoff-2026-10-27.md): thứ tự implement, role contract, acceptance criteria và blocker deploy.
6. [FE quick reference — 2026-11-23](./fe-quickref-2026-11-23.md): **bản ngắn, đọc trước** — Subscriptions (route, API, lỗi, Admin) và danh sách thay đổi docs từ 2026-11-10.
7. [FE handoff — Subscription (SUB-01) — 2026-11-23](./fe-subscription-handoff-2026-11-23.md): trạng thái triển khai, nghiệp vụ tóm tắt, acceptance criteria, câu hỏi mở và thứ tự làm của tính năng Subscription. Chi tiết API xem quick reference ở mục 6.

8. [FE — Log tin gửi thất bại — 2026-11-23](./fe-failed-message-log-2026-11-23.md): mọi tin lỗi có log kèm lý do (`errorCode` dạng `<CODE>: <chi tiết>`) và `sentAt`; thay đổi ở danh sách log, gửi đơn, campaign, dashboard, Public API và checklist nghiệm thu.

## Quy tắc nhận yêu cầu

- Chỉ triển khai thay đổi API sau khi BE phát hành handoff có task ID, role, request/response, validation và acceptance criteria.
- Không tự thêm endpoint, field, quyền hoặc state machine chưa có trong guide.
- Gửi câu hỏi UX/contract lại BE theo [PO-to-FE handoff](../planning/po-to-fe-handoff.md).
- Khi FE hoàn tất, gửi lại BE commit/deploy, test smoke và các thay đổi cần cập nhật tài liệu. BE cập nhật contract, changelog và board.
- Quick Chat đã bị gỡ khỏi API backend; gỡ toàn bộ route, component và request Quick Chat trong FE. URL API cũ sẽ trả `404`.

Runtime: `https://app.comvia.cloud` gọi `https://api.comvia.cloud/api/v1`.
