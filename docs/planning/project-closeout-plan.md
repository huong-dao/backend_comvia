# Project Closeout Plan — Comvia — 2026-10-27

## Quyết định áp dụng

- Runtime đang vận hành là `https://app.comvia.cloud` và `https://api.comvia.cloud/api/v1`.
- FE đang chạy là contract tham chiếu cho integration. Không sửa FE chỉ vì checkout BE local khác nó.
- Quick Chat đã bị PO loại khỏi sản phẩm. Việc còn lại chỉ là gỡ an toàn ở FE và BE; không phát triển tính năng mới.
- File này là **backlog triển khai cuối**. Bằng chứng mới phải được ghi trực tiếp vào board, changelog và ticket liên quan; không tạo audit hoặc contract song song.

## Trạng thái có thể chốt hiện tại

| Hạng mục | Trạng thái | Bằng chứng / giới hạn |
|---|---|---|
| FE deployment | Đang vận hành | Người vận hành xác nhận mọi thay đổi được deploy để kiểm tra trên server. `HEAD https://app.comvia.cloud` trả 200. |
| API deployment | Truy cập public được | `HEAD https://api.comvia.cloud/api/v1` trả 200. Chưa xác minh response có JWT, role, dữ liệu hay provider. |
| Backend local | Build và regression cơ bản đạt | `npm.cmd run build` PASS; unit 14/14 suites, 121/121 PASS ngày 2026-10-27 sau khi gỡ Quick Chat; `npx.cmd eslint src/app.module.ts` PASS. Chưa xác nhận hành vi trên server cho commit `dev2`. |
| FE local static check | Còn debt kỹ thuật | Lint còn 4 errors/29 warnings. Đây không phủ định luồng FE đang vận hành. |
| Tài liệu contract | Đã đồng bộ | Hai API guide là contract BE phát hành cho FE; mọi thay đổi theo PO-to-FE handoff. |

## Backlog phải làm

### P0 — xác minh contract runtime trước khi sửa integration

| ID | Owner | Công việc | Điều kiện hoàn tất |
|---|---|---|---|
| INT-01 | QA + BE + FE | Chạy matrix có đăng nhập trên production/staging cho Owner, Member, Staff và Admin. Kiểm tra members (`role`), workspace orders/invoices và invitation accept (C01/C02/C06). | Có request/response đã che dữ liệu nhạy cảm, environment/date, role và kết quả 200/403/404. Kết luận rõ deployment đang khác hay BE local đã lệch. |
| INT-02 | QA + FE | Kiểm tra smoke các luồng FE đang chạy: đăng nhập, switch workspace, template revision/CTA, wallet/topup, campaign, order/invoice và admin finance. | Mỗi luồng có case thành công/lỗi chính; lỗi được ghi ticket, không dựa vào suy luận source local. |

### P0 — bảo vệ tiền và loại bỏ bề mặt đã ngừng dùng

| ID | Owner | Công việc | Điều kiện hoàn tất |
|---|---|---|---|
| REL-01 | FE + BE | **BE code sẵn sàng trên `dev2` tại commit `d80c5e9`; FE báo code local sẵn sàng trên `dev` tại `6f9dfd7`:** BE đã gỡ module/controller/service/API route; FE đã gỡ direct route/component/request Quick Chat, Internal Quick Chat và browser mock webhook. Model/dữ liệu Prisma lịch sử giữ chờ retention. | Build/test BE xanh; FE báo lint/TypeScript/diff check pass nhưng production build bị chặn do môi trường không tải Google Fonts. Deploy đồng bộ, kiểm tra URL API cũ `404`, chốt redirect/404 URL UI cũ và smoke browser. |
| BE-01 | BE | Đã push `dev2` tại `93f191d`: khóa `WalletAccount` bằng `FOR UPDATE` trước khi ghi ledger và cập nhật số dư ở topup, single/public send, campaign (F02). | Unit test mock cạnh tranh debit 2/2, build và focused lint PASS ngày 2026-10-27. `DATABASE_URL` test không có và Docker daemon không chạy; cần chạy concurrency test có PostgreSQL, deploy và smoke để chứng minh không double-credit/debit, không âm số dư, ledger/balance nhất quán. |
| BE-02 | BE | Đã push `dev2` tại `6999c63`: request topup không nhận `vatRate`; VAT cố định 10% do server tính cho Pay2S, order và invoice (F03). | Unit 3/3 và build PASS ngày 2026-10-27; lint DTO/helper mới PASS, `TopupsService` còn lỗi lint cũ. Cần chạy topup test/smoke xác nhận request có `vatRate` bị 400 và tổng trước VAT/VAT/tổng thanh toán đúng. |

### P1 — khớp số liệu, giá và luồng tiền

| ID | Owner | Công việc | Điều kiện hoàn tất |
|---|---|---|---|
| BE-03 | BE | Đã push `dev2` tại `3fa3436`: public send dùng giá template + CTA như single/campaign; `CAMPAIGN_HOLD` là chi thực, `CAMPAIGN_REFUND` giảm monthly used và `totalSpent` (F04/F05). | Wallet regression 20/20 và build PASS ngày 2026-10-27. Cần smoke dữ liệu campaign success/failed để đối chiếu tổng chi. |
| BE-04 | BE | Code pushed `dev2` at `e9973cd`: database worker uses durable campaign runs and at-most-once claims; analytics rule is unchanged and already counts failed sends by `sentAt`. | Apply migration and smoke success, confirmed provider failure/refund, restart recovery to `RECONCILIATION_REQUIRED`, and analytics three periods on PostgreSQL. Never auto resend/refund ambiguous rows. |
| BE-05 | BE | Code pushed `dev2` at `c35a585`: Pay2S lifecycle/idempotency/audit and public workspace status are implemented; expiry is intentionally not added because no expiry duration was approved. | Apply migration and smoke duplicate callback, `PENDING → PAID`, verified `PENDING → FAILED`, and disabled workspace for all public endpoints. |
| BE-06 | BE | Code pushed `dev2` at `c3b5418`, `ecf2eb0` and `aebae21`: email-bound invitation plus Owner-only order/invoice/PDF routes. New invoice PDFs are private; Owner and ADMIN download via their respective guarded routes, while `invoicePdfUrl` is only a storage key. The migration script defaults to dry-run and validates path/content before an explicit `--apply`. | DevOps: back up data, run `npm run migrate:legacy-invoice-pdfs`, resolve failures, then run `npm run migrate:legacy-invoice-pdfs -- --apply`; verify public legacy files are gone. QA then checks Owner/Member/Admin role matrix and cross-workspace PDF access. |

### P1 — FE và tài liệu

| ID | Owner | Công việc | Điều kiện hoàn tất |
|---|---|---|---|
| FE-01 | FE | FE báo hoàn tất local tại `6f9dfd7`: sửa money accounts typing, OA/campaign state effect và topup hooks. | `npm run lint` 0 errors, `tsc --noEmit` và diff check pass theo báo cáo FE; cần deploy và smoke/regression page đã sửa. |
| FE-02 | FE + QA | FE báo hoàn tất local tại `6f9dfd7`: thêm kích thước `next/image` cho logo và fallback API tự thêm `/api/v1`. | Production build local bị chặn do environment không tải Google Fonts; cần build/tái hiện/smoke trên môi trường deploy trước khi Done. |
| FE-03 | FE + QA | Chỉ sửa các route members/orders/invoices/invitation sau INT-01. Giữ FE hiện hành nếu deployment đang phục vụ đúng contract. | Mọi thay đổi có response mẫu production/staging và test role/cross-workspace. |
| FE-04 | FE + PO | Chốt scope còn thiếu: profile update, workspace delete UI, topup history/unified flow, detailed analytics/system health, resend/revoke invitation, send-test, duplicate template. | Mỗi mục được đánh dấu `in scope`, `deferred` hoặc `not planned`; không tạo UI/API dựa trên suy đoán. |
| DOC-01 | BE owner + FE owner | FE bắt đầu từ [FE execution handoff](../frontend/fe-execution-handoff-2026-10-27.md), rồi cập nhật API guide do BE phát hành, mirror sang FE và ghi board/changelog bằng link test/deployment. | Không còn hai guide khác contract; board chỉ ghi Done khi có evidence. |

### P2 — chỉ làm sau khi PO chốt phạm vi

- Notification inbox, email/SMS events, jobs/reconciliation và vận hành admin (F13).
- Phone login/register, per-device session/logout, avatar/email/phone profile và hardening auth bổ sung (F14).
- Filter/pagination nâng cao cho message logs/campaign rows, OA description rule, admin routing/sitemap, analytics chi tiết và system health.
- CI, full authenticated E2E, migration staging và lint backend (F15). Đây là hạng mục xuyên suốt, nhưng không được giả định là đã xong chỉ vì build local qua.

## Thứ tự triển khai đề nghị

1. Làm `INT-01` và `INT-02`; ghi kết quả vào board và changelog.
2. Hoàn tất phần FE của `REL-01`, rồi deploy đồng bộ với BE; trong đợt release an toàn đầu tiên, deploy các code BE đã push và chạy smoke `BE-01`, `BE-02`.
3. Apply migration `BE-04` và `BE-05`, migrate PDF invoice lịch sử khỏi public storage, rồi smoke campaign recovery/topup callback và luồng owner finance.
4. Làm `FE-01` và `FE-02`; `FE-03` chỉ bắt đầu khi hợp đồng runtime đã được chứng minh; PO chốt `FE-04` trước khi mở feature mới.
5. Mỗi release cập nhật `DOC-01`, chạy smoke live theo role và thêm bằng chứng vào board.

## Nơi theo dõi chính thức

| Mục đích | File |
|---|---|
| Backlog triển khai và owner | File này |
| Hướng dẫn phát hành contract cho FE | [po-to-fe-handoff.md](./po-to-fe-handoff.md) |
| Trạng thái ticket sau khi bắt đầu làm | [board.md](../tickets/board.md) |

Không dùng các bảng Todo lịch sử để khởi động lại công việc đã có code. Một item chỉ chuyển Done khi có code được deploy, kiểm tra phù hợp và cập nhật contract/tài liệu.
