# Tình trạng dự án Comvia

_Cập nhật: 26/10/2026. Dùng để trao đổi ngắn gọn với quản lý/PO._

## Hiện có và đang vận hành

- FE đã deploy tại `app.comvia.cloud`; API chạy tại `api.comvia.cloud/api/v1`.
- Sản phẩm đã có các luồng chính: tài khoản và workspace, phân quyền Owner/Member/Staff/Admin, kết nối Zalo OA, quản lý template, gửi tin/campaign, ví credit/nạp tiền, đơn hàng/hóa đơn, API key và quản trị nội bộ.
- Tài liệu đã được chuẩn hóa: BE sở hữu yêu cầu nghiệp vụ và API contract; FE nhận cùng bộ `docs/` để triển khai.

Các điểm trên xác nhận sản phẩm có luồng hoạt động. Một số luồng cần kiểm tra lại theo role và dữ liệu thật trước khi coi là nghiệm thu hoàn toàn.

## Việc cần làm trước tiên

| Ưu tiên | Công việc | Kết quả cần có |
|---|---|---|
| P0 | Kiểm tra live theo Owner, Member, Staff và Admin | Xác nhận API/UI members, orders/invoices, invitation và quyền truy cập đúng trên server. |
| P0 | Loại bỏ Quick Chat | Không còn route, UI hoặc API Quick Chat vì tính năng đã không dùng. |
| P0 | Bảo vệ dòng tiền | Số dư ví an toàn khi xử lý đồng thời; VAT do server quyết định, không nhận tùy ý từ client. |
| P1 | Đồng nhất giá và báo cáo | Giá public/single/campaign, chi phí đã dùng, analytics và campaign recovery cho kết quả nhất quán. |
| P1 | Hoàn tất thanh toán và chứng từ | Topup lifecycle, chống callback trùng, order/invoice, PDF access và invitation đúng người nhận. |
| P1 | Chất lượng FE | Xử lý lint errors, kiểm tra sidebar image và API fallback; chỉ đổi integration sau khi contract runtime được xác minh. |

## Phần cần quyết định trước khi phát triển

- Khách hàng/Owner/Member được xem order, invoice và PDF ở mức nào.
- Invitation là link dùng chung hay bắt buộc đúng email/người được mời; có cần resend/revoke không.
- Phạm vi phase tiếp theo cho profile, xóa workspace, lịch sử topup, analytics chi tiết, system health, send-test và duplicate template.
- Có làm notification inbox, email/SMS nghiệp vụ, jobs/reconciliation, phone login và quản lý session/thiết bị trong phase tiếp theo hay không.

## Cách làm việc từ nay

1. PO gửi yêu cầu cho BE.
2. BE phân tích và cập nhật business rule, API contract, role, validation và acceptance criteria.
3. BE gửi gói handoff cho FE; FE triển khai theo contract đã phát hành.
4. Sau deploy, QA kiểm tra theo role và BE cập nhật trạng thái task/tài liệu.

## Mốc để coi một việc hoàn thành

Một task chỉ được đánh dấu hoàn thành khi có code deploy, kiểm tra phù hợp trên môi trường server, quyền truy cập đúng, và tài liệu/API contract đã cập nhật.

Chi tiết kỹ thuật và phân công: [Project closeout plan](./planning/project-closeout-plan.md). Quy trình gửi yêu cầu cho FE: [PO-to-FE handoff](./planning/po-to-fe-handoff.md).
