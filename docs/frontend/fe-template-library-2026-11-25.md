# FE — Thư viện mẫu tin (TPLLIB-01) — 2026-11-25

> **Đọc file này là đủ để làm toàn bộ tính năng.** Gồm: yêu cầu PO, quyền, màn hình, API (request/response), luồng "Sử dụng", lỗi, checklist nghiệm thu.
> Nguồn nghiệp vụ: `docs/business/business-rules.md` → Module 16 (BR-TPLLIB-01…05). Backend đã code trên nhánh `dev2`, **chưa deploy/migrate** tại thời điểm viết (cần chạy migration `20261125100000_template_library` trước khi gọi API).

Base URL: `https://api.comvia.cloud/api/v1` — mọi API đều cần `Authorization: Bearer <accessToken>`. **Không** cần header `x-workspace-id` (thư viện dùng chung toàn hệ thống).

---

## 1. Tóm tắt tính năng

Thư viện mẫu tin là kho mẫu **tham khảo** do **Admin** quản lý, chia theo **danh mục**. User thường xem thư viện và chọn một mẫu để **điền sẵn** vào form tạo/sửa mẫu tin của mình. Mẫu thư viện **không liên kết** với mẫu tin thật: sau khi điền sẵn, user tự chọn OA, chỉnh nội dung và lưu bằng API template hiện có. Sửa/xóa mẫu thư viện không ảnh hưởng mẫu tin user đã tạo.

## 2. Phân quyền (dựa trên `user.role` từ `GET /auth/me`)

| Role | Menu "Thư viện mẫu tin" | Trong popup tạo/sửa mẫu tin (Dashboard) | Quyền |
|------|------|------|------|
| `ADMIN` | Hiện — **giao diện quản lý** | — (Admin không tạo mẫu tin workspace ở đây) | Thêm/sửa/xóa mẫu tin + danh mục; xem như user |
| `USER` (Owner hoặc Member của workspace) | Hiện — **giao diện xem + "Sử dụng"** | Có select "Tạo thủ công / Tạo từ thư viện" | Chỉ xem, dùng mẫu |
| `STAFF` | **Ẩn** | **Không** hiện select (luôn thủ công) | API trả `403` |

- Ẩn menu/route bằng `user.role`; vẫn phải xử lý `403` (token hết quyền, gõ thẳng URL).
- Quyền của Owner/Member trong workspace **không** ảnh hưởng thư viện.

## 3. Yêu cầu giao diện

### 3.1 Menu "Thư viện mẫu tin" (Admin + User thường, ẩn với STAFF)

Trang dạng **lưới card**, mỗi mẫu tin là một card, **trình bày giống "Preview mẫu tin"** hiện có ở màn tạo/sửa mẫu tin (dùng lại component preview: hiển thị `title`, `content`, nội dung phụ, `content2`/`secondaryContent2`, bảng nếu `type = TABLE`, OTP nếu `type = OTP`, nút CTA). Phía trên có:

- **Select lọc danh mục**: option đầu "Tất cả danh mục" (không gửi `categoryId`), tiếp theo là danh mục từ API (kèm số mẫu `itemCount` nếu muốn), cuối cùng có thể thêm "Chưa phân loại" (gửi `categoryId=none`). **Đổi giá trị là gọi lại API ngay (về `page=1`), không có nút "Áp dụng".**
- **Ô tìm kiếm theo tên mẫu tin** (`keyword`, nên debounce ~400ms; BE tìm cả mô tả và tiêu đề).
- (Tùy chọn) select lọc `type` (`TEXT`/`TABLE`/`OTP`).
- **Phân trang** theo `meta` (`page`, `limit`, `total`, `totalPages`). Gợi ý `limit=12` (lưới 3 cột × 4 hàng).

**Admin** — mỗi card có nút **"Sửa"** và **"Xóa"**:
- "Sửa": mở **popup** form sửa mẫu tin thư viện (các field mục 4.3, thêm select danh mục).
- "Xóa": **hộp thoại xác nhận** ("Bạn có chắc muốn xóa mẫu tin này?"), đồng ý mới gọi `DELETE`. Xóa xong tải lại danh sách (nếu trang rỗng thì lùi một trang).
- Có nút **"Thêm mẫu tin"** (popup tạo) và khu **quản lý danh mục** (danh sách + thêm/sửa/xóa; xóa danh mục cũng cần xác nhận, ghi chú: "Các mẫu tin trong danh mục sẽ chuyển thành *Chưa phân loại*").
- Admin gọi các API `/admin/template-library/*` (mục 4.2–4.3) cho thao tác quản lý; dùng luôn cùng route cho danh sách của trang quản lý.

**User thường** — mỗi card có nút **"Sử dụng"** (không có Sửa/Xóa):
- Bấm "Sử dụng" → mở popup **"Tạo mẫu tin"** (chính là popup tạo mẫu tin ở Dashboard) với các field được **auto-fill** từ mẫu đã chọn (mục 5). Lưu bằng `POST /workspaces/:workspaceId/templates` như bình thường.

### 3.2 Popup tạo/sửa mẫu tin ở Dashboard (chỉ USER, không STAFF)

Áp dụng khi **tạo mới** mẫu tin hoặc **sửa mẫu tin trạng thái `DRAFT`** (mẫu đã gửi duyệt/approved giữ nguyên hành vi cũ, **không** hiện select này). Trong popup thêm một **select** với 2 option:

1. **"Tạo thủ công"** (mặc định): mọi thứ như hiện tại, user tự nhập.
2. **"Tạo từ thư viện"**: mở **popup thư viện** nằm **che lên** popup tạo/sửa (z-index cao hơn, có lớp phủ):
   - Hiển thị danh sách mẫu tin thư viện dạng **lưới 3 cột một hàng**, mỗi card kiểu preview, có nút **"Sử dụng"**.
   - Có **bộ lọc danh mục** (select, áp dụng ngay, không nút "Áp dụng"), ô tìm theo tên và phân trang như 3.1.
   - Phải có nút **"X"** ở góc để đóng popup thư viện khi không dùng; đóng bằng "X" thì **giữ nguyên** nội dung đang nhập ở popup tạo/sửa và select quay về/giữ "Tạo thủ công" (không mất dữ liệu).
   - Bấm "Sử dụng": **đóng popup thư viện** và **fill toàn bộ nội dung** từ mẫu đã chọn vào popup tạo/sửa (quy tắc ở mục 5). Gợi ý: nếu form đang có dữ liệu user đã nhập, hiện xác nhận "Nội dung hiện tại sẽ bị thay thế" trước khi điền (tùy chọn, không bắt buộc theo PO).
   - Sau khi fill, user có thể sửa tiếp mọi field rồi lưu bình thường.

> Lưu ý `STAFF`: không hiện select, không hiện menu.

## 4. API

Quy ước chung:
- Danh sách trả `{ "data": [...], "meta": { "page", "limit", "total", "totalPages" } }`.
- Không tìm thấy → `404`. Dữ liệu sai → `400` (`message` là chuỗi hoặc mảng chuỗi). Sai quyền (STAFF, hoặc USER gọi route admin) → `403`. Chưa đăng nhập → `401`.
- Enum: `type` ∈ `TEXT` | `TABLE` | `OTP`; CTA `type` ∈ `OA_PROFILE`, `ZALO_MINI_APP`, `OA_ARTICLE`, `BUSINESS_WEBSITE`, `PHONE_CALL`, `EXTERNAL_WEB_OR_MINI_APP`, `APP_DOWNLOAD`, `DISTRIBUTION_PAGE`, `EXTERNAL_APP`.

### 4.1 API cho user thường và Admin (xem)

Role: `USER`, `ADMIN` (STAFF → `403`).

**`GET /template-library/categories`** — danh sách danh mục để dựng select lọc.

Query: `page` (mặc định 1), `limit` (mặc định 100, tối đa 200), `keyword` (tên danh mục, tùy chọn). Sắp theo `sortOrder` rồi `name`.

```json
{
  "data": [
    { "id": "ckx1", "name": "Thông báo đơn hàng", "description": "Mẫu cho đơn hàng", "sortOrder": 0,
      "itemCount": 5, "createdAt": "2026-11-25T03:00:00.000Z", "updatedAt": "2026-11-25T03:00:00.000Z" }
  ],
  "meta": { "page": 1, "limit": 100, "total": 1, "totalPages": 1 }
}
```

**`GET /template-library/items`** — danh sách mẫu tin (phân trang, lọc, tìm kiếm).

| Query | Kiểu | Ghi chú |
|-------|------|---------|
| `page` | int ≥ 1 | Mặc định 1 |
| `limit` | int 1–100 | Mặc định 12 |
| `keyword` | string | Tìm theo `name`, `description`, `title` (chứa, không phân biệt hoa thường) |
| `categoryId` | string | Id danh mục; giá trị đặc biệt `none` = chưa phân loại; bỏ trống = tất cả |
| `type` | enum | `TEXT` \| `TABLE` \| `OTP` |

Sắp xếp: mới nhất trước. Mỗi phần tử có cùng shape với chi tiết (đủ để render card preview, **không cần gọi thêm chi tiết** để hiển thị card):

```json
{
  "data": [
    {
      "id": "ckm9",
      "categoryId": "ckx1",
      "category": { "id": "ckx1", "name": "Thông báo đơn hàng" },
      "name": "Xác nhận đơn hàng",
      "description": "Gửi khi khách đặt hàng thành công",
      "type": "TEXT",
      "title": "Đơn hàng của bạn",
      "content": "<nội dung mẫu, định dạng giống content của mẫu tin hiện có>",
      "secondaryContent": null,
      "content2": null,
      "secondaryContent2": null,
      "otpExpiryMinutes": null,
      "placeholdersJson": { "name": "Nguyễn Văn A", "orderId": "DH001" },
      "placeholder_labels": { "name": "Tên khách", "orderId": "Mã đơn" },
      "placeholderOrder": ["name", "orderId"],
      "ctaButtons": [
        { "type": "BUSINESS_WEBSITE", "label": "Xem đơn", "target": "https://shop.vn/orders", "position": 0 }
      ],
      "createdAt": "2026-11-25T03:00:00.000Z",
      "updatedAt": "2026-11-25T03:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 12, "total": 1, "totalPages": 1 }
}
```

Ghi chú field: `category` là `null` và `categoryId` là `null` khi chưa phân loại. `description` và các field nội dung có thể `null`. `ctaButtons` là mảng (đã sắp theo `position`) hoặc `null` nếu không có nút; **không có đơn giá**. `placeholder_labels`, `placeholderOrder` có thể `null`.

**`GET /template-library/items/:itemId`** — chi tiết một mẫu (cùng shape một phần tử ở trên). `404` nếu không tồn tại (ví dụ Admin vừa xóa).

### 4.2 API Admin — danh mục

Role: `ADMIN` (USER/STAFF → `403`). Base: `/admin/template-library`.

| Method & path | Body | Kết quả |
|------|------|------|
| `GET /admin/template-library/categories` | — (query như 4.1) | Như 4.1 |
| `POST /admin/template-library/categories` | `{ "name": "…", "description"?: "…", "sortOrder"?: 0 }` | Danh mục vừa tạo |
| `PATCH /admin/template-library/categories/:categoryId` | `{ "name"?, "description"?: string\|null, "sortOrder"? }` (bỏ field = giữ nguyên; `description: null` = xóa) | Danh mục sau cập nhật |
| `DELETE /admin/template-library/categories/:categoryId` | — | `{ "id": "…", "deleted": true, "orphanedItems": 3 }` |

Ràng buộc: `name` 1–100 ký tự, **duy nhất không phân biệt hoa thường** (trùng → `400` "Library category name already exists"); `description` ≤ 500; `sortOrder` 0–100000. **Xóa danh mục không xóa mẫu tin**: các mẫu đó thành chưa phân loại (`orphanedItems` = số mẫu bị ảnh hưởng — có thể dùng hiện toast).

### 4.3 API Admin — mẫu tin

Role: `ADMIN`. Base: `/admin/template-library`.

| Method & path | Mô tả |
|------|------|
| `GET /admin/template-library/items` | Như 4.1 |
| `GET /admin/template-library/items/:itemId` | Như 4.1 |
| `POST /admin/template-library/items` | Tạo; trả mẫu vừa tạo (`201`) |
| `PATCH /admin/template-library/items/:itemId` | Sửa từng phần; trả mẫu sau cập nhật |
| `DELETE /admin/template-library/items/:itemId` | Xóa hẳn; trả `{ "id": "…", "deleted": true }` |

**Body tạo (`POST`):**

| Field | Kiểu | Bắt buộc | Ghi chú |
|-------|------|----------|---------|
| `name` | string 2–200 | Có | Tên mẫu trong thư viện; cũng là tên điền sẵn vào mẫu tin khi "Sử dụng" |
| `description` | string ≤ 1000 | Không | Mô tả ngắn hiển thị trên card |
| `categoryId` | string | Không | Phải tồn tại, sai → `404` "Library category not found" |
| `type` | `TEXT`\|`TABLE`\|`OTP` | Không | Mặc định `TEXT` |
| `title` | string | Không | |
| `content` | string | **Bắt buộc với `TEXT`/`TABLE`**; bị bỏ qua với `OTP` | |
| `secondaryContent`, `content2`, `secondaryContent2` | string | Không | Bị bỏ qua với `OTP` |
| `otpExpiryMinutes` | int ≥ 1 | **Bắt buộc với `OTP`** | |
| `placeholdersJson` | object | **Bắt buộc với `TEXT`/`TABLE`**; với `OTP` phải có **đúng** 2 key `otp`, `phut` | |
| `placeholder_labels` | object `{slug: nhãn}` | Không | Mọi key phải có trong `placeholdersJson`, value là string |
| `placeholderOrder` | string[] | Không | Phần tử phải có trong `placeholdersJson`, không trùng; slug thiếu BE tự nối cuối |
| `ctaButtons` | array ≤ 2 | Không | Mỗi phần tử `{ type, label?, target?, position }`, `position` 0 hoặc 1, không trùng; luật `target` giống mẫu tin thật (mọi loại trừ `OA_PROFILE` bắt buộc `target`; `PHONE_CALL` là số điện thoại VN; còn lại là URL http/https; `label` ≤ 100) |

**Body sửa (`PATCH`)**: cùng các field, **tất cả tùy chọn**. Bỏ field = giữ nguyên; gửi `null` = xóa giá trị (áp dụng cho `description`, `categoryId`, `title`, các nội dung, `otpExpiryMinutes`, `placeholdersJson`, `placeholder_labels`, `placeholderOrder`, `ctaButtons`). `categoryId: null` chuyển mẫu về chưa phân loại. BE kiểm tra lại cấu trúc theo `type` trên dữ liệu **sau khi gộp**, nên đổi `type` phải gửi đủ field mà type mới cần. Với form popup sửa, cách đơn giản nhất: **gửi toàn bộ field của form** mỗi lần lưu.

Lỗi validate thường gặp (`400`): `content is required for TEXT/TABLE templates`, `placeholdersJson is required for TEXT/TABLE templates`, `otpExpiryMinutes is required for OTP templates`, `OTP placeholdersJson must contain exactly: otp, phut`, `placeholder_labels has keys not in placeholdersJson: …`, `placeholderOrder has …`, `CTA target is required for …`. Hiển thị `message` cho Admin.

## 5. "Sử dụng" mẫu: quy tắc fill form

Dữ liệu lấy trực tiếp từ item của danh sách (hoặc gọi `GET /template-library/items/:itemId` để chắc chắn bản mới nhất, nhất là khi popup mở lâu). Form tạo/sửa mẫu tin hiện có dùng cùng tên field nên ánh xạ gần như 1-1:

| Field mẫu thư viện | Field form mẫu tin (`POST/PATCH /workspaces/:workspaceId/templates`) | Ghi chú |
|------|------|------|
| `name` | `name` | User có thể đổi |
| `type` | `type` | Đổi `type` kéo theo bố cục form (TEXT/TABLE/OTP) |
| `title` | `title` | |
| `content` | `content` | `OTP`: không có |
| `secondaryContent`, `content2`, `secondaryContent2` | cùng tên | |
| `otpExpiryMinutes` | `otpExpiryMinutes` | Chỉ `OTP` |
| `placeholdersJson` | `placeholdersJson` | |
| `placeholder_labels` | `placeholder_labels` | |
| `placeholderOrder` | `placeholderOrder` | |
| `ctaButtons[]` (`type`,`label`,`target`,`position`) | `ctaButtons[]` | **Không** gửi `id`, **không** gửi `unitPrice` (user không được đặt giá → `403`) |
| `description`, `category`, `id`, `createdAt`… | **không dùng** | Chỉ là metadata của thư viện |

Quy tắc:
- **Ghi đè toàn bộ** nội dung form bằng dữ liệu mẫu (giá trị `null` ⇒ để trống field tương ứng).
- **Không fill** OA (`oaConnectionId`/OA hiện tại của workspace) và `code`/`trackingId`: user tự chọn/ nhập theo luồng hiện có. Mẫu tin thật vẫn phải qua quy trình `DRAFT → submit → duyệt` như bình thường.
- Khi **sửa mẫu tin DRAFT**: fill chỉ thay nội dung trong form; chỉ khi user bấm Lưu mới `PATCH` mẫu tin. Đóng popup thư viện bằng "X" thì không đổi gì.
- Sau khi fill, mẫu tin tạo ra **độc lập** với thư viện (BE không lưu nguồn, không có endpoint "sử dụng").

## 6. Luồng gọi API tóm tắt

```
Mở trang/popup thư viện
  ├─ GET /template-library/categories            → dựng select lọc
  └─ GET /template-library/items?page=1&limit=12  → render lưới card
Đổi select danh mục / gõ tìm kiếm / chuyển trang
  └─ GET /template-library/items?categoryId=…&keyword=…&page=…   (gọi ngay, không nút "Áp dụng")
Bấm "Sử dụng" (user)
  └─ (tùy chọn) GET /template-library/items/:id → fill form → POST|PATCH /workspaces/:workspaceId/templates
Admin: thêm/sửa/xóa
  └─ POST|PATCH|DELETE /admin/template-library/items…  và  …/categories…  → tải lại danh sách
```

## 7. Trạng thái trống / lỗi

- Danh sách rỗng: "Chưa có mẫu tin nào" (Admin: kèm nút "Thêm mẫu tin"); rỗng do lọc/tìm: "Không tìm thấy mẫu tin phù hợp".
- `404` khi bấm "Sử dụng"/"Sửa" (mẫu vừa bị Admin xóa): toast "Mẫu tin không còn tồn tại", tải lại danh sách.
- `403`: ẩn menu/route theo role; nếu vẫn gặp thì chuyển về trang chính.
- Loading: skeleton card; lỗi mạng: nút "Thử lại".

## 8. Checklist nghiệm thu

- [ ] Menu "Thư viện mẫu tin" hiện với `ADMIN` và `USER`; **ẩn** với `STAFF`; STAFF gọi API nhận `403`.
- [ ] Trang thư viện dạng lưới card, card trình bày giống preview mẫu tin hiện có.
- [ ] Select danh mục lọc ngay khi chọn, **không có nút "Áp dụng"**; có "Tất cả" (và "Chưa phân loại" nếu làm).
- [ ] Tìm theo tên hoạt động, có phân trang đúng `meta`.
- [ ] Admin: card có "Sửa" (popup) và "Xóa" (hộp thoại xác nhận); thêm/sửa/xóa mẫu và danh mục chạy được, lỗi validate hiển thị rõ.
- [ ] Xóa danh mục: mẫu thuộc danh mục vẫn còn, hiện ở "Chưa phân loại".
- [ ] User thường: card có "Sử dụng"; bấm mở popup "Tạo mẫu tin" đã fill đúng mọi field (kể cả `placeholder_labels`, `placeholderOrder`, `ctaButtons`, `otpExpiryMinutes`); user chọn OA rồi lưu được.
- [ ] Dashboard: popup tạo mới và popup **sửa mẫu DRAFT** có select "Tạo thủ công / Tạo từ thư viện" (USER); mẫu không phải DRAFT và STAFF **không** có select.
- [ ] "Tạo từ thư viện": popup thư viện che lên popup tạo/sửa, lưới 3 cột, có lọc danh mục, có nút **X** đóng; "Sử dụng" đóng popup thư viện và fill popup bên dưới; bấm X không làm mất dữ liệu đang nhập.
- [ ] Mẫu tin tạo từ thư viện không bị ảnh hưởng khi Admin sửa/xóa mẫu thư viện.

## 9. Ghi chú cho FE / phụ thuộc

- Backend đã có trên `dev2`; cần deploy + chạy migration trước khi FE test với môi trường thật. Đến lúc đó danh mục/mẫu trong thư viện đang **trống**, Admin cần tạo dữ liệu đầu tiên.
- Không có endpoint "tạo mẫu tin từ thư viện": FE dùng API template hiện có (xem `docs/FRONTEND_API_GUIDE_NEXTJS.mdc` mục 7).
- Phần nội dung ban đầu của thư viện (seed) PO chưa yêu cầu; Admin nhập tay.
- Câu hỏi mở đã chuyển PO: xóa danh mục hiện **giữ** mẫu tin (xem BR-TPLLIB-02). Nếu PO đổi sang xóa luôn mẫu tin, response `DELETE category` sẽ đổi tương ứng và BE báo lại FE.
