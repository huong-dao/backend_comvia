# Component Design — oa

> Cấu trúc module `src/oa/` sau khi áp ADR-001 (tách OA profile/connection) và ADR-002 (lưu ảnh đĩa cục bộ). Mô hình dữ liệu: `erd.md` cùng thư mục.

## OaProfileController (mới)
**Trách nhiệm:** CRUD thông tin OA do user quản lý và upload ảnh. Path `workspaces/:workspaceId/oa`.
- `POST` — "Tạo OA": tạo `WorkspaceOa` + `WorkspaceOaConnection` rỗng (`status=NOT_CONNECTED`), không cần OAuth.
- `PATCH` — sửa `name`/`code`/`description`/ảnh.
- `GET` — trả box "Thông tin OA": field profile + trạng thái kết nối (join 1 cấp sang `WorkspaceOaConnection`).
- Upload `avatar`/`logoLight`/`logoDark` qua `FileInterceptor`.
**Cấu trúc bên trong:** Controller → `OaProfileService` → `PrismaService` + `FileStorageService`. Controller chỉ điều hướng.
**Phụ thuộc:** `OaProfileService`, guard `WorkspaceContextGuard`/`WorkspaceRolesGuard`, `FileStorageService` (common).
**Rule/Requirement liên quan:** BR-OA-01, BR-OA-05, BR-CORE-06, BR-AUDIT-01.

## OaProfileService (mới)
**Trách nhiệm:** Logic CRUD profile; enforce 1-1 workspace↔OA; validate kích thước ảnh 400x96; ghi audit log tạo/sửa OA.
**Cấu trúc bên trong:** Service → `PrismaService` (bảng `WorkspaceOa`), `FileStorageService` (ghi ảnh `public/oa/<workspaceId>/`), `AuditLogService`. Validate kích thước ảnh bằng `image-size` trước khi ghi (ADR-002).
**Phụ thuộc:** `PrismaService`, `FileStorageService`, `AuditLogService`.
**Rule/Requirement liên quan:** BR-OA-01, BR-OA-05, BR-CORE-06.

## OaConnectionsController (hiện có, giữ nguyên path)
**Trách nhiệm:** `connect`/`connect/redirect`/`disconnect`/`status` OAuth Zalo.
**Phụ thuộc:** `OaConnectionsService`.
**Rule/Requirement liên quan:** BR-OA-02, BR-OA-03.

## OaConnectionsService (hiện có, sửa)
**Trách nhiệm:** Flow OAuth Zalo (PKCE, exchange code, lưu token), đọc trạng thái kết nối.
**Cấu trúc bên trong:** Service → `PrismaService` (bảng `WorkspaceOaConnection`), `ZaloOAuthClient`, `AuditLogService`. Sau ADR-001: mọi thao tác OAuth ghi vào `WorkspaceOaConnection` qua quan hệ `workspaceOaId`; `handleOAuthCallback` bỏ ghi `oaName`/avatar sang profile — không chạm field nhập tay. `getStatus` đọc connection, loại token.
**Phụ thuộc:** `PrismaService`, `ZaloOAuthClient`, `AuditLogService`.
**Rule/Requirement liên quan:** BR-OA-02, BR-OA-03, BR-OA-05.

## OaTokenService / OaMessagingService (hiện có, không đổi concept)
**Trách nhiệm:** Lấy/làm mới access token; gửi tin qua OA. Đọc token từ `WorkspaceOaConnection`.
**Phụ thuộc:** `PrismaService`, `ZaloOAuthClient`/Zalo messaging client.
**Rule/Requirement liên quan:** BR-MSG-01, BR-OA-03.
