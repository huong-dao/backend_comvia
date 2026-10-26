# Frontend Documentation Pack

Đây là điểm bắt đầu dành cho team FE sau khi nhận toàn bộ thư mục `docs/` từ BE.

## Bắt buộc đọc

1. [Frontend API guide](../FRONTEND_API_GUIDE_NEXTJS.mdc): API user/workspace/staff.
2. [Admin router map](../FRONTEND_ADMIN_ROUTER_API_MAP.mdc): API và route admin.
3. [Project closeout plan](../planning/project-closeout-plan.md): task hiện hành, owner và thứ tự làm.
4. [Delivery board](../tickets/board.md): trạng thái task.

## Quy tắc nhận yêu cầu

- Chỉ triển khai thay đổi API sau khi BE phát hành handoff có task ID, role, request/response, validation và acceptance criteria.
- Không tự thêm endpoint, field, quyền hoặc state machine chưa có trong guide.
- Gửi câu hỏi UX/contract lại BE theo [PO-to-FE handoff](../planning/po-to-fe-handoff.md).
- Khi FE hoàn tất, gửi lại BE commit/deploy, test smoke và các thay đổi cần cập nhật tài liệu. BE cập nhật contract, changelog và board.

Runtime: `https://app.comvia.cloud` gọi `https://api.comvia.cloud/api/v1`.
