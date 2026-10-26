# Delivery Board — Comvia

| ID | Ưu tiên | Owner | Trạng thái | Điều kiện để Done |
|---|---|---|---|---|
| INT-01 | P0 | QA + BE + FE | Chưa bắt đầu | Kiểm tra live theo role cho members, orders/invoices và invitation; có bằng chứng request/response đã che dữ liệu. |
| INT-02 | P0 | QA + FE | Chưa bắt đầu | Smoke live các luồng đăng nhập, workspace, template, wallet/topup, campaign, order/invoice và admin. |
| REL-01 | P0 | BE + FE | Chưa bắt đầu | Quick Chat không còn route, request hay tài liệu active; URL cũ có hành vi migration đã chốt. |
| BE-01 | P0 | BE | Chưa bắt đầu | Ledger/số dư an toàn khi concurrent topup, send và campaign. |
| BE-02 | P0 | BE | Chưa bắt đầu | VAT được quyết định phía server và có regression test topup/order/invoice. |
| BE-03 | P1 | BE | Chưa bắt đầu | Giá public/single/campaign và monthly spend thống nhất. |
| BE-04 | P1 | BE | Chưa bắt đầu | Analytics và campaign recovery đúng quy tắc đã chốt. |
| BE-05 | P1 | BE | Chưa bắt đầu | Topup lifecycle, idempotency/audit và public workspace status được kiểm thử. |
| BE-06 | P1 | BE | Chưa bắt đầu | Contract orders/invoices/invitation, PDF access và role matrix được chốt và QA. |
| FE-01 | P1 | FE | Chưa bắt đầu | Lint không còn errors, có smoke/regression cho các page sửa. |
| FE-02 | P1 | FE + QA | Chưa bắt đầu | Tái hiện rồi mới sửa sidebar image và fallback API configuration. |
| FE-03 | P1 | FE + QA | Chờ INT-01 | Chỉ thay integration members/orders/invoices/invitation khi runtime contract đã xác minh. |
| FE-04 | P2 | FE + PO | Chờ PO | Scope profile, delete workspace, topup history, analytics, system health, invitation và template extension đã được quyết định. |
| DOC-01 | P1 | BE + FE | Liên tục | Mỗi task thay đổi contract đều cập nhật guide, changelog và bằng chứng deploy/QA. |

Chi tiết phạm vi và thứ tự thực hiện: [Project closeout plan](../planning/project-closeout-plan.md).
