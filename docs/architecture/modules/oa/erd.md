# ERD — oa

> Mô hình sau khi áp ADR-001 (tách OA profile khỏi dữ liệu kết nối Zalo). Model `WorkspaceOaConnection` cũ (`prisma/schema.prisma:481-505`) được tách làm hai.

## Entity: WorkspaceOa
Thông tin OA do user tự quản lý trên Comvia. Nguồn dữ liệu độc lập, OAuth Zalo không ghi đè.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | String | PK, `@default(cuid())` | Tái dùng `id` của `WorkspaceOaConnection` cũ khi migrate |
| workspaceId | String | `@unique`, FK → Workspace | 1-1 cứng với Workspace |
| name | String | not null | Tên OA nhập tay |
| code | String | not null | Nhãn nội bộ Comvia, string tự do; không map/đối soát `oaId` Zalo |
| description | String? | nullable | Mô tả OA |
| avatarUrl | String? | nullable | URL `/public/oa/...` |
| logoLightUrl | String? | nullable | Ảnh 400x96, validate kích thước ở backend |
| logoDarkUrl | String? | nullable | Ảnh 400x96, validate kích thước ở backend |
| createdByUserId | String? | nullable | Người tạo OA record |
| createdAt | DateTime | `@default(now())` | Ngày tạo (hiển thị ở box "Thông tin OA") |
| updatedAt | DateTime | `@updatedAt` | |

## Entity: WorkspaceOaConnection
Dữ liệu kết nối Zalo OAuth, tách khỏi profile. Chỉ update khi connect/disconnect.

| Field | Type | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | String | PK, `@default(cuid())` | |
| workspaceOaId | String | `@unique`, FK → WorkspaceOa | 1-1 với profile |
| oaId | String | not null | `oa_id` thật từ Zalo (`'pending'` trước khi OAuth xong) |
| oaName | String? | nullable | Do Zalo cấp; hiển thị phụ, không ghi sang profile |
| oaAvatarLight | String? | nullable | Do Zalo cấp |
| oaAvatarDark | String? | nullable | Do Zalo cấp |
| accessToken | String? | nullable | Token OAuth; loại khỏi response |
| refreshToken | String? | nullable | Loại khỏi response |
| tokenExpiredAt | DateTime? | nullable | |
| oauthState | String? | nullable, `@@index` | State PKCE |
| oauthCodeVerifier | String? | nullable | Loại khỏi response |
| oauthStateExpiresAt | DateTime? | nullable | TTL 1h |
| status | OaConnectionStatus | `@default(NOT_CONNECTED)` | enum giữ nguyên |
| connectedAt | DateTime? | nullable | |
| createdAt | DateTime | `@default(now())` | |
| updatedAt | DateTime | `@updatedAt` | |

## Quan hệ
- `Workspace` --(1:1)--> `WorkspaceOa`: mỗi workspace đúng 1 OA profile (`workspaceId @unique`), enforce `BR-CORE-06`/`BR-OA-01`.
- `WorkspaceOa` --(1:1)--> `WorkspaceOaConnection`: mỗi profile có tối đa 1 bản ghi kết nối (`workspaceOaId @unique`); tạo rỗng `NOT_CONNECTED` khi "Tạo OA".
- `WorkspaceOa` --(1:N)--> `Template`: FK `Template.oaConnectionId` trỏ về `WorkspaceOa.id` (sau migrate, giá trị không đổi nhờ tái dùng id).
- `WorkspaceOa` --(1:N)--> `MessageLog`: FK `MessageLog.oaConnectionId` trỏ về `WorkspaceOa.id`.
- `WorkspaceOa` --(1:N)--> `Campaign`: FK `Campaign.oaConnectionId` trỏ về `WorkspaceOa.id`.
