# Comvia — Tài liệu Frontend

Team frontend **chỉ cần đọc 2 file** trong thư mục này:

| File | Dùng cho |
|------|----------|
| [FRONTEND_API_GUIDE_NEXTJS.mdc](./FRONTEND_API_GUIDE_NEXTJS.mdc) | App user/workspace: auth, workspace, member, OA, template, topup, messaging, API key |
| [FRONTEND_ADMIN_ROUTER_API_MAP.mdc](./FRONTEND_ADMIN_ROUTER_API_MAP.mdc) | Màn admin backoffice: router → API map |

## Ghi chú nhanh

- Base URL API: `NEXT_PUBLIC_API_BASE_URL` phải gồm prefix `/api/v1`.
- Workspace APIs cần header `x-workspace-id`.
- Enum/status trả về từ API dùng **UPPER_SNAKE_CASE** (ví dụ `ACTIVE`, `PENDING_ZALO_APPROVAL`) — xem mục **Phụ lục A** trong API guide.

## Không cần đọc khi làm FE

- `.cursor/rules/` — quy tắc nghiệp vụ và coding cho backend/AI
- `prisma/schema.prisma` — schema DB (tham khảo khi cần field chính xác)
