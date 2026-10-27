# FE execution handoff — 2026-10-27

## Mục đích và trạng thái

Tài liệu này là thứ tự thực hiện dành cho FE sau khi đã nhận thư mục `docs/` từ BE. API guide là contract chính thức; không tạo endpoint, field, role hoặc state mới ngoài các guide đó.

BE code đã sẵn sàng trên branch `dev2`, nhưng chưa có bằng chứng deploy/live cho các thay đổi closeout. Vì vậy FE được làm các việc local ở phần A và B ngay; phần C chỉ thay đổi integration sau khi có kết quả `INT-01` trên staging/production.

## Cập nhật FE — 2026-10-27

FE báo commit `6f9dfd7` trên branch `dev`: đã gỡ Quick Chat, xử lý bốn lint errors, thêm kích thước logo và fallback `/api/v1`. `npm run lint`, `tsc --noEmit` và `git diff --check` pass theo báo cáo FE. Production build vẫn bị chặn ở môi trường local do không tải được Google Fonts; chưa có browser, deploy hoặc live verification. Bước tiếp theo của FE là deploy cùng release BE, xác minh build trong môi trường deploy, rồi chạy phần D; không mở `FE-03` trước `INT-01`.

## Tài liệu phải đọc

1. [Frontend API guide](../FRONTEND_API_GUIDE_NEXTJS.mdc) — user/workspace/public API.
2. [Admin router map](../FRONTEND_ADMIN_ROUTER_API_MAP.mdc) — màn hình và endpoint ADMIN.
3. [Delivery board](../tickets/board.md) — trạng thái hiện hành.
4. [Project closeout plan](../planning/project-closeout-plan.md) — acceptance criteria và dependency.

## A. Reported complete locally — REL-01: retire Quick Chat

- Gỡ tất cả route, page, component, import, navigation và request Quick Chat, kể cả direct route Admin/Internal.
- Gỡ trang browser mock webhook Pay2S; webhook là server-to-server, không gọi từ browser.
- Không chỉ ẩn menu: sau release, FE không còn gọi URL/API Quick Chat cũ. Quyết định redirect/404 của URL UI cũ phải được FE chốt trong release note.

**Done khi:** không còn source reference/request Quick Chat; lint và smoke navigation liên quan pass. Đồng bộ release với BE để API cũ trả `404`.

## B. Reported complete locally — chất lượng FE

### FE-01: lint

- Sửa bốn lỗi lint đã ghi trong closeout plan: money-account typing, OA/campaign state effect và topup hooks.
- Không mở rộng thay đổi nghiệp vụ trong ticket lint.

**Trạng thái:** lint/TypeScript/diff check được FE báo pass; deploy và smoke/regression vẫn pending.

### FE-02: tái hiện và sửa

- Tái hiện sidebar image dùng `next/image` thiếu kích thước.
- Tái hiện fallback API base URL khi environment không có `/api/v1`.
- Chỉ sửa sau khi có reproduction; deployment hiện hữu có thể đã cấu hình đúng.

**Trạng thái:** code local được FE báo đã sửa; cần build/smoke browser trong môi trường deploy vì local production build bị chặn bởi tải Google Fonts.

## C. Chờ INT-01 — integration có role và dữ liệu tài chính

Không tự đổi page members, orders, invoices hoặc invitation trước khi có request/response từ staging/production. Sau `INT-01`, áp dụng các contract sau.

| Bề mặt               | Contract FE phải giữ                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance workspace    | Chỉ `OWNER` hiển thị/gọi orders, invoices và PDF. `MEMBER` không có UI tài chính và phải xử lý `403` an toàn nếu gọi direct route.                                                                                                                                                                                                                                                                                                                    |
| Owner PDF            | Tải bằng `GET /workspaces/:workspaceId/invoices/:invoiceId/pdf`; chỉ invoice `ISSUED` có file.                                                                                                                                                                                                                                                                                                                                                        |
| Admin PDF            | Tải bằng `GET /admin/invoices/:invoiceId/pdf`. `invoicePdfUrl` là private storage key, **không** mở trực tiếp trên browser.                                                                                                                                                                                                                                                                                                                           |
| Admin finance        | Chỉ `ADMIN` gọi `/admin/orders` và `/admin/invoices`; `STAFF` không có finance capability.                                                                                                                                                                                                                                                                                                                                                            |
| Invitation           | Chỉ mời bằng email. Tài khoản accept phải có email trùng chính xác email được mời. Không làm UI resend/revoke; Owner remove member đã accept qua quản lý members.                                                                                                                                                                                                                                                                                     |
| Template/CTA pricing | UI không tự tính/ghi đè giá gửi. Giá server trả về dùng template + CTA; `unitPrice` chỉ ADMIN được đặt.                                                                                                                                                                                                                                                                                                                                               |
| Public API           | Dùng đúng `x-api-key`/`api_key` và shape ở API guide; Public send dùng giá template + CTA do BE tính.                                                                                                                                                                                                                                                                                                                                                 |
| Zalo send result     | Với Single, Public và Campaign, `SUCCESS` vẫn chỉ là “Zalo đã tiếp nhận yêu cầu gửi”. Giai đoạn hiện tại chỉ test send; webhook delivery đang deferred vì BE không kiểm soát relay Zalo. Không làm UI “Đã nhận”, quota hoặc polling như dữ liệu live; `providerDeliveredAt` hiện sẽ là null. Không gọi `POST /webhooks/zalo-zns/delivery` hoặc dùng bearer secret ở FE. Xem [provider conformance](../architecture/zalo-zns-provider-conformance-2026-10-27.md). |

## D. Sau deploy — INT-01 và INT-02

FE phối hợp QA/BE kiểm tra có đăng nhập và lưu bằng chứng request/response đã che dữ liệu:

1. Owner/Member/Staff/Admin: quyền members, orders, invoices và invitation accept.
2. Owner được đọc/tải invoice trong workspace mình sở hữu; Member/Staff bị từ chối; cross-workspace không lộ dữ liệu.
3. Admin tải PDF qua guarded endpoint; không dùng storage key/public URL.
4. Smoke: đăng nhập, switch workspace, template revision/CTA, wallet/topup, campaign, order/invoice và admin finance.

5. Ghi environment, ngày, role, kết quả HTTP 200/403/404 và commit FE vào board trước khi đánh dấu Done.

## E. Phản hồi yêu cầu handoff QA/release của FE — 2026-10-27

- **Release evidence:** BE không có environment, thời điểm QA, release SHA hay raw HTTP response đã che dữ liệu. Vì vậy `INT-01`, `INT-02`, `REL-01` vẫn không được đánh dấu đạt chỉ dựa trên giả định deploy/QA. Khi có evidence, ghi lại environment/date/revision và matrix `200`/`403`/`404` trong board.
- **Finance/PDF source contract:** Owner workspace dùng các route orders/invoices/PDF trong API guide; Member bị WorkspaceRolesGuard chặn; Admin-only route `/admin/orders`, `/admin/invoices`, `/admin/invoices/:invoiceId/pdf` chặn Staff. PDF chỉ stream khi invoice `ISSUED` có private storage key; `POSTED` hoặc file thiếu trả `404` (`Issued invoice PDF not found`). Cross-workspace bị query scope/guard chặn. Đây là source evidence, chưa thay thế runtime matrix.
- **Invitation accept (BE-08 code ready on `dev2`, deploy pending):** Owner chỉ gửi `EMAIL`; backend gửi link `{COMVIA_APP_BASE_URL}/app/invitations/accept?workspaceId={workspaceId}&token={token}` tới email đó, không trả token cho browser. FE giữ query qua login, gọi accept sau JWT đúng email và redirect client-side bằng `redirectPath` trả về. Không làm phone/token-demo, resend hoặc revoke UI.
- **Cleanup source contract:** Quick Chat API đã retired; Pay2S webhook là server-to-server, FE không gọi `/webhooks/pay2s`; API runtime base phải có `/api/v1`. Browser/API `404` và production build vẫn cần evidence runtime.

## F. Không làm khi chưa có PO

Không tự mở feature cho profile update, workspace delete UI, topup history/unified flow, detailed analytics/system health, resend/revoke invitation, send-test hoặc duplicate template. Đây là `FE-04`, chờ PO chốt scope.

## Bàn giao ngược về BE

Khi hoàn tất từng ticket, FE gửi: commit/branch, thay đổi route/API, lint/test/smoke đã chạy, môi trường deploy (nếu có), và mọi mismatch contract. BE sẽ cập nhật API guide, changelog và delivery board.
