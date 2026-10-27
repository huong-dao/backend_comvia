# Delivery Board — Comvia

| ID | Ưu tiên | Owner | Trạng thái | Điều kiện để Done |
|---|---|---|---|---|
| INT-01 | P0 | QA + BE + FE | Chưa bắt đầu | Kiểm tra live theo role cho members, orders/invoices và invitation; có bằng chứng request/response đã che dữ liệu. |
| INT-02 | P0 | QA + FE | Chưa bắt đầu | Smoke live các luồng đăng nhập, workspace, template, wallet/topup, campaign, order/invoice và admin. |
| REL-01 | P0 | BE + FE | BE code sẵn sàng trên `dev2`; deploy/smoke và FE chờ | BE commit `d80c5e9`: `npm.cmd run build`, 14/14 test suites (121 tests) và lint `src/app.module.ts` PASS ngày 2026-10-27; đã gỡ module/API route và cập nhật contract. Model/dữ liệu Prisma lịch sử giữ chờ retention. FE gỡ route/component/request Quick Chat, chốt URL UI cũ; deploy đồng bộ rồi kiểm tra URL cũ/API `404`. |
| BE-01 | P0 | BE | Code chuẩn bị cục bộ trên `dev2`; chưa commit/push | Đã thêm khóa `FOR UPDATE` theo ví owner trước khi ghi ledger/cập nhật số dư cho topup, single/public send và campaign; test concurrency mock 2/2 PASS, `npm.cmd run build` PASS, focused lint PASS ngày 2026-10-27. Chưa có kiểm chứng PostgreSQL thực tế hay deploy. Cần chuyển công việc sang nhánh `dev`, review/commit/push, rồi chạy concurrency test với DB trước release. |
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
