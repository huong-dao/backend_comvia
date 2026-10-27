# Project Discuss — Comvia

Tài liệu ngắn để trao đổi về tình trạng các nhóm tính năng lớn của dự án.

## Đã có

- **Tài khoản và workspace:** đăng ký/đăng nhập, phân quyền Owner/Member/Staff/Admin, tạo và quản lý workspace.
- **Zalo OA và template:** tạo OA, kết nối OAuth, quản lý template, quy trình submit/duyệt/trả về sửa/disable.
- **Gửi tin và campaign:** gửi tin đơn lẻ, import CSV, tạo/chạy/retry campaign, lịch sử gửi tin.
- **Ví và thanh toán:** ví credit, tạo QR topup Pay2S, theo dõi trạng thái nạp tiền, tạo order/invoice.
- **Quản trị:** quản lý user/workspace, OA, template, giá gửi tin, tài khoản nhận tiền, orders/invoices và audit log.
- **Tích hợp:** API key và Public API cho hệ thống bên ngoài.

Các nhóm trên đã có code và được deploy; không đồng nghĩa mọi luồng đã được nghiệm thu đầy đủ theo tất cả role và tình huống lỗi.

## Chưa hoàn tất hoặc cần chỉnh

- **Quick Chat:** BE đã gỡ code, module và API route trên `dev2` (build và 121 unit tests PASS ngày 27/10); FE còn phải gỡ UI, route và request cũ. Cần deploy/smoke server trước khi chốt release. Model/dữ liệu Prisma lịch sử được giữ đến khi có quyết định retention.
- **An toàn tiền:** cần bảo đảm số dư ví đúng khi nhiều giao dịch chạy đồng thời và VAT chỉ do server quyết định.
- **Giá và báo cáo:** cần thống nhất giá giữa Public API, gửi đơn lẻ và campaign; kiểm tra lại chi phí đã dùng, analytics và campaign recovery.
- **Thanh toán/chứng từ:** cần hoàn thiện topup lifecycle, chống callback trùng, quyền xem order/invoice/PDF và invitation đúng người nhận.
- **Kiểm tra live theo role:** cần xác nhận đầy đủ quyền Owner, Member, Staff và Admin trên server.
- **Chất lượng FE:** còn lint errors và một số điểm cần tái hiện trước khi sửa, như sidebar image và fallback API URL.

## Cần làm tiếp

1. Kiểm tra các luồng chính trên server bằng tài khoản test theo từng role.
2. FE gỡ Quick Chat và deploy đồng bộ với BE; sau đó kiểm tra URL UI/API cũ.
3. Hoàn thành các sửa đổi P0 về số dư ví và VAT.
4. Hoàn thiện giá, analytics, campaign, topup, invoice và invitation.
5. Chốt với PO các chức năng phase sau: profile mở rộng, xóa workspace, lịch sử topup, analytics chi tiết, system health, resend/revoke invitation, send-test và duplicate template.

## Nguyên tắc làm việc

BE phân tích yêu cầu PO, chốt business rule và API contract, sau đó phát hành cho FE. FE triển khai theo contract đã phát hành; sau deploy, QA kiểm tra theo role rồi mới đánh dấu hoàn thành.

Chi tiết thực hiện: [Project closeout plan](./planning/project-closeout-plan.md). Bản tóm tắt quản lý: [Project status](./project-status.md).
