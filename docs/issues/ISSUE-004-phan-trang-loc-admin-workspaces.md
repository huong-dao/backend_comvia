# ISSUE-004: GET /admin/workspaces chưa hỗ trợ filter/phân trang phía BE

**Trạng thái:** BE đã triển khai xong (2026-10-29) — FE đổi fetcher theo contract mới
**Phân loại:** Missing Spec (gap kỹ thuật, không phải rule nghiệp vụ)
**Màn hình/route liên quan:** `app/admin/workspaces/page.tsx` — trang danh sách workspace cho admin

## Mô tả gốc từ khách hàng/PO
> trang admin/workspaces hiển thị danh sách Workspaces cho admin xem, mà không có bộ lọc hay phân trang thì lúc nhiều lên sao mà tìm kiếm

## Rule/API hiện tại
`docs/FRONTEND_ADMIN_ROUTER_API_MAP.mdc` mục 3: `GET /admin/workspaces` — không có query param nào (không `keyword`/`status`/`page`/`limit`), trả thẳng mảng toàn bộ workspace, không có field `meta` phân trang.

So sánh với các trang admin khác đã có sẵn:
- `GET /admin/orders` (mục dùng ở `app/admin/orders/page.tsx`): hỗ trợ `page`, `limit`, `workspaceId`, `ownerUserId`, `status`, `orderCode`, trả `{ data, meta: { page, limit, total, totalPages } }`.
- `GET /admin/templates`: hỗ trợ `status`, `workspaceId`, `oaId`, `keyword`, `limit`.
- `GET /admin/users`: cùng tình trạng như `/admin/workspaces` — không có query param nào.

## Hành vi thực tế đã verify
- `app/admin/workspaces/page.tsx` gọi `GET /admin/workspaces` không kèm param, nhận về toàn bộ mảng workspace trong 1 lần, không giới hạn số lượng.
- Trước khi sửa: trang chỉ hiển thị thẳng toàn bộ danh sách vào bảng, không có ô tìm kiếm, không phân trang.
- **Đã tạm xử lý phía FE (commit kèm issue này):** thêm ô tìm kiếm (theo tên/slug/ID chủ workspace) + lọc theo trạng thái + phân trang — nhưng lọc/phân trang này chạy **hoàn toàn ở client**, trên dữ liệu đã tải về hết. Đây là giải pháp tạm, không giải quyết gốc vấn đề quy mô: nếu số workspace tăng lên hàng nghìn, mỗi lần vào trang vẫn phải tải về toàn bộ bảng workspace cùng lúc — chậm, tốn băng thông, và không có giới hạn trên (không an toàn khi dữ liệu lớn).

## Hành vi mong đợi
`GET /admin/workspaces` cần hỗ trợ phân trang + lọc thật ở phía BE, theo đúng pattern đã có ở `GET /admin/orders`:
- Query param: `page`, `limit` (mặc định hợp lý, ví dụ 20-50), `keyword` (tìm theo tên/slug), `status` (enum `WorkspaceStatus`), có thể thêm `ownerUserId` nếu cần tìm theo chủ workspace.
- Response trả `{ data: WsRow[], meta: { page, limit, total, totalPages } }` — cùng shape với `/admin/orders` để FE dùng lại đúng pattern `PaginationBar` đã có.

## Phân tích tác động
- `GET /admin/users` cũng đang ở tình trạng y hệt (không filter/phân trang) — nếu BE làm `/admin/workspaces`, nên cân nhắc làm luôn `/admin/users` theo cùng 1 lần để tránh phải mở lại issue tương tự sau này. Không bắt buộc trong phạm vi issue này, chỉ ghi chú để BE cân nhắc ưu tiên.
- Khi BE có endpoint chuẩn, FE cần đổi `app/admin/workspaces/page.tsx` từ lọc/phân trang client-side (tạm) sang gọi lại API với query param — thay đổi cục bộ trong 1 file, không ảnh hưởng chỗ khác.

## Giả định / Câu hỏi mở
CÂU HỎI MỞ: BE có đồng ý làm theo đúng shape `{ data, meta }` giống `/admin/orders` không, hay có pattern phân trang khác đang được chuẩn hóa cho toàn bộ `/admin/*`?
CÂU HỎI MỞ: Có cần filter theo khoảng ngày tạo (`createdAt`) không, hay chỉ cần `keyword` + `status` là đủ cho nhu cầu hiện tại?
GIẢ ĐỊNH: Trong lúc chờ BE, giải pháp lọc/phân trang client-side tạm thời là chấp nhận được cho quy mô dữ liệu hiện tại (chưa tới mức nghìn workspace).

## Hướng xử lý đề xuất
**BE (đề xuất, chờ xác nhận):**
1. Thêm `page`, `limit`, `keyword`, `status` cho `GET /admin/workspaces`, trả `{ data, meta }` giống `/admin/orders`.
2. Cân nhắc làm luôn cho `GET /admin/users` nếu thuận tiện (cùng gap).

**FE:**
1. Đã làm tạm: lọc + phân trang client-side trong `app/admin/workspaces/page.tsx` (xem commit kèm issue này).
2. Khi BE xong: đổi fetcher sang gọi kèm query string + đọc `meta` để phân trang server-side, bỏ logic lọc client-side — theo đúng pattern đã có ở `app/admin/orders/page.tsx`.

## Xử lý

**BE — đã triển khai (2026-10-29):** `GET /admin/workspaces` giờ nhận `page`, `limit`, `keyword`, `status`, `ownerUserId` và trả `{ data, meta }` — contract đầy đủ ở `docs/FRONTEND_ADMIN_ROUTER_API_MAP.mdc` mục 3.

**Trả lời 2 CÂU HỎI MỞ:**
1. *Theo đúng shape `{ data, meta }` giống `/admin/orders`?* — Đúng, dùng y hệt shape đó (`page`, `limit`, `total`, `totalPages`), không có pattern phân trang nào khác đang chuẩn hóa riêng cho `/admin/*`.
2. *Có cần filter theo khoảng ngày tạo không?* — Chưa làm, theo đúng giả định trong issue ("chỉ cần `keyword` + `status` là đủ"). Nếu sau này cần lọc theo `createdAt`, thêm 2 param `createdAtFrom`/`createdAtTo` tương tự `/admin/orders` là đủ, không phải thiết kế lại.

**Lưu ý:** đây là **breaking change** — response cũ trả thẳng mảng, giờ trả `{ data, meta }`. FE phải đổi fetcher cùng lúc với lúc BE deploy, không thể để FE cũ chạy song song với BE mới (FE cũ sẽ đọc nhầm object `{ data, meta }` như một workspace hoặc lỗi runtime tùy cách code).

**Chưa làm `GET /admin/users`** (gợi ý "nhân tiện" trong issue) — giữ đúng phạm vi ticket này. Nếu muốn làm, nên mở issue/ticket riêng vì cùng pattern nhưng là 1 thay đổi breaking riêng biệt.

**FE:** đổi `app/admin/workspaces/page.tsx` từ lọc/phân trang client-side sang gọi kèm query string + đọc `meta`, bỏ logic lọc client-side tạm thời — theo đúng pattern đã có ở `app/admin/orders/page.tsx`.
