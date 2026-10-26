# ADR-001: Tách OA profile khỏi dữ liệu kết nối Zalo

**Trạng thái:** Accepted (2026-10-02, chốt theo đề xuất SA)
**Ngày:** 2026-10-02

## Bối cảnh
Hiện một model `WorkspaceOaConnection` (`prisma/schema.prisma:481-505`) gộp cả thông tin OA hiển thị (`oaName`, `oaAvatarLight`, `oaAvatarDark`) lẫn dữ liệu OAuth Zalo (`oaId`, `accessToken`, `refreshToken`, `tokenExpiredAt`, `oauthState`, `status`, `connectedAt`). Record chỉ sinh ra khi user bắt đầu OAuth (`startConnect` upsert với `oaId='pending'`); không có đường tạo OA thủ công. `Template`, `MessageLog`, `Campaign` đều FK tới `oaConnectionId`.

ISSUE-003 (BR-OA-01, BR-OA-05, BR-CORE-06) yêu cầu: thông tin OA do user tự quản lý (`name`, `code`, `avatar`, `logoLight` 400x96, `logoDark` 400x96, mô tả, người tạo) là nguồn dữ liệu độc lập, quan hệ 1-1 cứng với Workspace; dữ liệu kết nối Zalo lưu tách; OAuth thành công không ghi đè field nhập tay, không đồng bộ 2 chiều. Hai hành động độc lập: "Tạo OA" (nhập tay, không cần OAuth) và "Kết nối" (OAuth).

Ràng buộc: hệ thống đã chạy production, `WorkspaceOaConnection` có dữ liệu thật và được 3 bảng FK tới. Workspace↔OA và OA↔Connection đều 1-1, nên ba thực thể (Workspace, OA profile, Connection) ở quan hệ song ánh.

## Các phương án đã cân nhắc
### Phương án A: Tách 2 bảng — `WorkspaceOa` (profile) + `WorkspaceOaConnection` (kết nối)
- `WorkspaceOa` giữ field user nhập tay, 1-1 với Workspace. `WorkspaceOaConnection` giữ field OAuth Zalo, 1-1 với `WorkspaceOa`. FK `Template`/`MessageLog`/`Campaign` trỏ về `WorkspaceOa`.
- Ưu điểm: tách vật lý khớp mô hình nghiệp vụ PO mô tả; "no overwrite" được bảo đảm ở mức schema (OAuth ghi vào bảng khác, không chạm cột profile); record profile tồn tại độc lập trước khi OAuth.
- Nhược điểm: migration phải tách mỗi row cũ thành 2 row và re-point FK của 3 bảng. Rủi ro giảm nhờ tái dùng `id`: `WorkspaceOa.id` = `WorkspaceOaConnection.id` cũ, nên giá trị `oaConnectionId` ở 3 bảng con vẫn khớp, chỉ đổi bảng được tham chiếu.
- Tham chiếu: tách bảng "aggregate root + detail" là pattern chuẩn khi hai concern có vòng đời ghi độc lập (profile do user ghi, connection do OAuth ghi).

### Phương án B: Mở rộng `WorkspaceOaConnection` thêm field nhập tay
- Thêm cột `code`, `logoLight`, `logoDark`, `description`, `createdByUserId` vào bảng hiện có; "no overwrite" chỉ đảm bảo ở tầng service (callback OAuth không ghi các cột đó).
- Ưu điểm: migration thuần cộng cột nullable, không đổi FK — rủi ro production thấp nhất; hợp quy mô modular monolith.
- Nhược điểm: một bảng trộn hai concern; "lưu tách" chỉ là logic, không vật lý; record vẫn phải tồn tại trước OAuth (chấp nhận được). Ràng buộc "không ghi đè" chỉ sống trong code, dễ bị vi phạm khi sửa callback về sau.

## Quyết định
Chọn Phương án A. Migration tái dùng `id` khử phần lớn rủi ro FK của Phương án A, đổi lại ranh giới "profile do user quản lý" vs "connection do OAuth quản lý" được enforce ở mức schema — khớp yêu cầu PO "nguồn dữ liệu độc lập, lưu tách, không đồng bộ" và loại khả năng callback OAuth vô tình ghi đè field nhập tay.

Mô hình:
- `WorkspaceOa`: `workspaceId @unique` (1-1 cứng), `name`, `code`, `description`, `avatarUrl`, `logoLightUrl`, `logoDarkUrl`, `createdByUserId`.
- `WorkspaceOaConnection`: `workspaceOaId @unique`, `oaId` (Zalo), `oaName`/`oaAvatarLight`/`oaAvatarDark` (do Zalo cấp, chỉ hiển thị phụ, không ghi sang profile), token, `oauthState`/`oauthCodeVerifier`/`oauthStateExpiresAt`, `status`, `connectedAt`.
- FK `Template.oaConnectionId`, `MessageLog.oaConnectionId`, `Campaign.oaConnectionId` trỏ về `WorkspaceOa.id`.

Kế hoạch migration (production, một migration Prisma):
1. Tạo bảng `WorkspaceOa`. Với mỗi row `WorkspaceOaConnection` cũ: insert `WorkspaceOa` tái dùng `id` cũ và `workspaceId`; `name` lấy từ `oaName` cũ (fallback mã sinh từ workspace nếu null); các field nhập tay khác để null.
2. Thêm `workspaceOaId` vào `WorkspaceOaConnection`, set = `id` của chính nó (bằng id profile vừa tạo), đặt `@unique`.
3. Drop FK cũ của `Template`/`MessageLog`/`Campaign` tới `WorkspaceOaConnection`, tạo lại FK cùng cột `oaConnectionId` trỏ tới `WorkspaceOa.id`. Giá trị cột không đổi (id tái dùng) nên không có row mồ côi.
4. Giữ các cột `oaName`/`oaAvatarLight`/`oaAvatarDark` trên `WorkspaceOaConnection`; không migrate sang profile (profile là nguồn độc lập, field nhập tay mặc định trống).

Ràng buộc 1-1 enforce bằng `@unique` trên `WorkspaceOa.workspaceId` và `WorkspaceOaConnection.workspaceOaId`. "Tạo OA" tạo `WorkspaceOa` + `WorkspaceOaConnection` rỗng `status=NOT_CONNECTED`; OAuth chỉ update bảng connection.

Giữ tên cột FK `oaConnectionId` ở 3 bảng con để giảm churn code; đổi tên thành `workspaceOaId` là tùy chọn tinh gọn do Team Lead cân nhắc ở ticket, không bắt buộc trong migration này.

## Hệ quả
- OAuth callback (`handleOAuthCallback`) chỉ ghi bảng `WorkspaceOaConnection`; bỏ nhánh ghi `oaName` sang profile — field nhập tay không bị chạm.
- `GET /workspaces/:workspaceId/oa` đọc join `WorkspaceOa` + `WorkspaceOaConnection` (1 cấp, trong giới hạn include của coding-convention) để trả cả thông tin profile lẫn trạng thái kết nối.
- Rule gửi tin (`BR-MSG-01`/`BR-OA-03`): OA profile tồn tại không đủ để gửi; vẫn cần `WorkspaceOaConnection.status=CONNECTED`. Câu hỏi "profile trống có auto-fill từ Zalo lần đầu không" thuộc PO, chưa chốt — mặc định không auto-fill cho tới khi PO quyết.
- Lưu ảnh avatar/logo: xem ADR-002 (đọc kèm ADR này).
- Cần xem lại khi: Zalo cho một workspace nhiều OA (phá vỡ 1-1), hoặc khi cần đồng bộ 2 chiều profile↔Zalo (đảo ngược giả định "no overwrite").
