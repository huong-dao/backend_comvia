# PO-to-FE Handoff

## Mục đích

BE là đầu mối phân tích yêu cầu PO và phát hành contract cho FE. FE chỉ triển khai theo gói handoff đã được cập nhật trong bộ tài liệu này.

## Gói handoff bắt buộc

Mỗi thay đổi có tác động FE phải gồm:

1. Mục tiêu nghiệp vụ và ID rule trong `business/business-rules.md`.
2. Quyền theo role và workspace scope.
3. Endpoint, method, headers, request/response mẫu, mã lỗi và validation.
4. State machine hoặc điều kiện hiển thị, nếu có.
5. Migration/rollout compatibility: field mới, field bỏ, thời điểm deploy BE và FE.
6. Acceptance criteria và case kiểm tra thành công/lỗi/403/cross-workspace.
7. ID task trong `tickets/board.md` và ngày cập nhật `business/change-log.md`.

## Cách phát hành

1. BE cập nhật business rule và API guide trong cùng thay đổi.
2. BE gửi cho FE: link/commit tài liệu, task ID và tóm tắt thay đổi tương thích.
3. FE phản hồi các điểm không thể triển khai hoặc câu hỏi UX; BE/PO chốt trước khi FE đoán contract.
4. Nếu cần deploy theo hai bước, BE phải giữ backward compatibility hoặc nêu rõ thời điểm cutover.
5. QA kiểm tra API theo role trước, sau đó kiểm tra UI. Kết quả được ghi vào board.

## Quy tắc tài liệu

- `business-rules.md` là yêu cầu nghiệp vụ.
- Hai `FRONTEND_*.mdc` là contract FE nhận từ BE.
- `project-closeout-plan.md` là backlog hiện hành; `board.md` là trạng thái thực thi.
- Không tạo bản API guide riêng trong FE và không duy trì hai contract khác nhau.
