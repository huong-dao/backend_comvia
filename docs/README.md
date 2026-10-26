# Comvia Documentation

Tài liệu trong thư mục này do **BE sở hữu** và là bộ tài liệu duy nhất được copy sang FE. Không đưa audit, handoff, issue hay ticket lịch sử vào đây.

Để trao đổi nhanh với quản lý/PO, xem [Tình trạng dự án](./project-status.md).

## Đọc theo vai trò

| Vai trò | Đọc trước |
|---|---|
| PO/BA/BE | [Business rules](./business/business-rules.md), [BRD](./business/brd.md), [Project closeout plan](./planning/project-closeout-plan.md) |
| BE developer | Business rules, [Architecture](./architecture/north-star.md), [Coding convention](./architecture/coding-convention.md), [Board](./tickets/board.md) |
| FE developer | [Frontend API guide](./FRONTEND_API_GUIDE_NEXTJS.mdc), [Admin router map](./FRONTEND_ADMIN_ROUTER_API_MAP.mdc), [Project closeout plan](./planning/project-closeout-plan.md) |

## Nguồn tài liệu và quy trình

1. PO gửi yêu cầu cho BE/BA.
2. BE cập nhật `business-rules.md`, `brd.md` và `change-log.md`; nếu có thay đổi API thì cập nhật hai API guide.
3. BE tạo hoặc cập nhật task trong `tickets/board.md`, kèm API contract, role, validation và tiêu chí nghiệm thu.
4. BE gửi gói thay đổi cho FE theo [PO-to-FE handoff](./planning/po-to-fe-handoff.md). FE không tự đổi business rule hoặc API contract.
5. Sau deploy và kiểm thử, BE cập nhật board và changelog. Chỉ khi đó task mới là Done.

## Runtime

- Web app: `https://app.comvia.cloud`
- API base URL: `https://api.comvia.cloud/api/v1`
- FE phải cấu hình `NEXT_PUBLIC_API_BASE_URL` bao gồm `/api/v1`.

Quick Chat đã ngừng sử dụng; không tạo yêu cầu hoặc UI mới cho tính năng này.

## Gói gửi cho FE

Xem [frontend/README.md](./frontend/README.md). Khi copy cả `docs/` sang repo FE, giữ nguyên cấu trúc và dùng gói này làm điểm bắt đầu.
