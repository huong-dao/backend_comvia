# ISSUE-002: Nút "Đăng nhập Owner" trên trang admin/workspaces (impersonate)

**Trạng thái:** BE đã triển khai xong (2026-10-29) — chờ FE làm theo contract bên dưới
**Phân loại:** Missing Spec (tính năng mới, chưa có rule/API)
**Màn hình/route liên quan:** `app/admin/workspaces/page.tsx` — bảng danh sách workspace, cột hành động (dòng 93-109, cạnh nút "Ngừng kích hoạt")

## Mô tả gốc từ khách hàng/PO
> khi user admin đang ở trang admin/workspaces, trang này hiển thị danh sách workspaces, nếu muốn bổ sung nút "Đăng nhập Owner" kế bên nút "Ngừng kích hoạt". Và mục đích của nút này là khi bấm vào sẽ mở ra một tab mới là Dashboard của workspace của owner không.
> Kiểu như tôi đang làm admin, tôi muốn đăng nhập với tư cách owner của một workspace một cách nhanh chóng để làm gì đó. Nhưng mà mở tab mới với tư cách là owner đó thì tab cũ có còn là admin không? Và có làm được tính năng này không?

## Rule/API hiện tại
Chưa có — grep toàn bộ `docs/` không có mục nào về "impersonate"/"đăng nhập hộ". Đây là tính năng hoàn toàn mới.

Cơ chế lưu session hiện tại (`lib/auth.ts:11-35`):
- `saveAuthSession()` ghi access token vào `localStorage` (nếu tick "Ghi nhớ đăng nhập") hoặc `sessionStorage`.
- `getAccessToken()` đọc `localStorage` **trước**, fallback `sessionStorage` sau (dòng 28-35).
- `localStorage` dùng chung cho **mọi tab cùng origin** — đây là điểm chặn kỹ thuật chính của yêu cầu này.

## Hành vi thực tế đã verify
- Nếu admin đăng nhập có tick "Ghi nhớ đăng nhập" (token ở `localStorage`), và tab mới ghi đè `localStorage` bằng token owner, thì tab admin cũ — ở lần gọi API hoặc F5 tiếp theo — sẽ đọc nhầm phải token owner (vì cùng key `localStorage`, cùng origin) → **mất phiên admin ở tab cũ**, không phải chỉ ảnh hưởng tab mới.
- Nếu dùng `sessionStorage` cho phiên owner mới: theo spec trình duyệt, tab mới mở bằng `window.open`/`target=_blank` cùng origin sẽ **clone** `sessionStorage` của tab mở ra nó tại thời điểm mở, nhưng sau đó là 2 storage độc lập — ghi vào `sessionStorage` của tab mới không ảnh hưởng tab cũ. Tuy nhiên vì `getAccessToken()` ưu tiên `localStorage` trước, nếu admin dùng `localStorage` (remember), tab mới vẫn đọc nhầm token admin từ `localStorage` thay vì token owner mới ghi vào `sessionStorage`.

## Hành vi mong đợi
Theo yêu cầu PO:
- Trang `admin/workspaces`, cột hành động, thêm nút "Đăng nhập Owner" cạnh "Ngừng kích hoạt".
- Bấm vào → mở tab mới, vào thẳng Dashboard của workspace đó với quyền Owner.
- Tab admin gốc **không bị ảnh hưởng** — vẫn giữ nguyên phiên đăng nhập ADMIN.

## Phân tích tác động
- Cần sửa `lib/auth.ts`: thêm cơ chế lưu token "đăng nhập hộ" tách biệt khỏi token đăng nhập thật của admin, và `getAccessToken()` (dùng ở hầu hết mọi trang gọi API) phải ưu tiên đọc đúng token theo từng tab — ảnh hưởng rộng vì đây là hàm dùng chung toàn app.
- Đây là hành động nhạy cảm về bảo mật/quyền riêng tư: admin có thể thao tác thay owner (xem ví/đơn hàng/tin nhắn của khách hàng) mà owner không biết — **bắt buộc phải có audit log** ghi rõ ai (admin nào) đăng nhập hộ ai (owner nào), workspace nào, lúc nào.
- Cần quyết định thời hạn token impersonate (ngắn hơn token thường, ví dụ 15-30 phút) để giảm rủi ro nếu tab bị để mở quên.
- Cần UX rõ ràng trong tab mới để owner (hoặc admin đang dùng tab đó) biết đang ở "chế độ đăng nhập hộ", tránh nhầm với phiên owner thật — ví dụ banner cố định trên đầu trang kèm nút "Thoát chế độ đăng nhập hộ".

## Giả định / Câu hỏi mở
CÂU HỎI MỞ: BE có đồng ý thêm endpoint kiểu `POST /admin/workspaces/:workspaceId/impersonate` trả về access token ngắn hạn đóng vai Owner của workspace đó không? Nếu workspace có nhiều hơn 1 Owner (hiện tại mỗi workspace có đúng 1 `ownerUserId` theo `WsRow.ownerUserId`), token trả về ứng với user nào?
CÂU HỎI MỞ: Token impersonate có thời hạn bao lâu? Có cần refresh token riêng không, hay hết hạn thì bắt đăng nhập lại (không refresh)?
CÂU HỎI MỞ: Audit log action tên gì (đề xuất `workspace.admin_impersonated`), ghi field gì (`adminUserId`, `workspaceId`, `targetOwnerUserId`, thời điểm)?
CÂU HỎI MỞ: Trong lúc impersonate, các hành động "nhạy cảm" của owner (xóa workspace, đổi billing, submit template, tạo topup...) có bị giới hạn/cảnh báo gì riêng không, hay owner impersonate có đầy đủ quyền y như owner thật đăng nhập?
GIẢ ĐỊNH: Mỗi workspace có đúng 1 Owner (theo field `ownerUserId` hiện có) — nút này đăng nhập hộ đúng user đó, không cần chọn trong danh sách nhiều owner.

## Hướng xử lý đề xuất
**BE (đề xuất, chờ PO/BE duyệt):**
1. Thêm `POST /admin/workspaces/:workspaceId/impersonate` (role `ADMIN`) → trả về access token ngắn hạn mang danh tính Owner của workspace, kèm thông tin workspace để FE redirect đúng chỗ.
2. Ghi audit log mỗi lần gọi thành công (action đề xuất `workspace.admin_impersonated`).
3. Giới hạn thời hạn token impersonate ngắn hơn token đăng nhập thường.

**FE (làm sau khi BE xác nhận contract):**
1. Sửa `lib/auth.ts`: thêm key lưu riêng cho token impersonate (chỉ `sessionStorage`, không đụng `localStorage` của admin), và sửa thứ tự ưu tiên đọc token sao cho mỗi tab đọc đúng phiên của chính nó.
2. Thêm trang nhận token kiểu `/auth/impersonate?token=...&workspaceId=...`: đọc token từ URL, lưu vào `sessionStorage` của tab đó, redirect vào dashboard workspace (`workspacePath(workspaceId, "...")`).
3. Thêm nút "Đăng nhập Owner" ở `app/admin/workspaces/page.tsx` (cạnh "Ngừng kích hoạt", dòng ~93-109): gọi API impersonate, nhận token, `window.open()` tab mới trỏ vào trang nhận token ở bước 2.
4. Thêm banner cố định trong layout workspace khi đang ở phiên impersonate (nhận biết qua token/flag riêng), kèm nút thoát về `/admin`.

## Xử lý

**BE — đã triển khai (2026-10-29):**
- `POST /admin/workspaces/:workspaceId/impersonate` (role `ADMIN`) — xem contract đầy đủ ở `docs/FRONTEND_ADMIN_ROUTER_API_MAP.mdc` mục 3.
- `GET /auth/me` trả thêm `isImpersonation` + `impersonatedByAdmin` để FE dựng banner — xem `docs/FRONTEND_API_GUIDE_NEXTJS.mdc` mục 3.4.
- Audit log action `workspace.admin_impersonated` ghi mỗi lần gọi thành công.

**Trả lời các CÂU HỎI MỞ (quyết định của BE khi code, có thể PO xem lại):**
1. *Workspace nhiều owner?* — Không áp dụng: mỗi workspace vẫn đúng 1 owner qua `Workspace.ownerUserId`, token impersonate luôn ứng với user đó.
2. *Thời hạn token, có refresh không?* — **20 phút, không refresh.** Hết hạn thì API trả `401`, FE phải điều hướng tab đó về trang đăng nhập (không tự gọi lại impersonate). Token cũng tự vô hiệu ngay nếu owner đổi/reset mật khẩu trong lúc đang bị impersonate (dùng chung cơ chế `tokenVersion`).
3. *Audit log field gì?* — Action `workspace.admin_impersonated`, ghi `actorUserId` (admin), `workspaceId`, `resourceId` (= workspaceId), `metadataJson: { targetOwnerUserId, targetOwnerEmail, expiresInMinutes }`.
4. *Giới hạn hành động nhạy cảm trong lúc impersonate?* — **CHƯA.** Phase 1 cố tình giữ đơn giản: phiên impersonate có đầy đủ quyền y như owner tự đăng nhập (đổi billing, xóa workspace, submit template, tạo topup...), không có guard/giới hạn riêng. Đây là giới hạn đã biết, không phải bị bỏ sót — **cần PO xác nhận lại** nếu muốn hạn chế thêm trước khi FE release tính năng này cho người dùng thật.

**FE — làm theo contract ở trên** (sửa `lib/auth.ts`, trang nhận token, nút "Đăng nhập Owner", banner impersonate) như đề xuất ở mục "Hướng xử lý đề xuất" phía trên.
