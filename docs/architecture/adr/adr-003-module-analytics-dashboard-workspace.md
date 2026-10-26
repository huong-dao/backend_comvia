# ADR-003: Vị trí endpoint analytics/overview cấp workspace

**Trạng thái:** Accepted (2026-10-02, chốt theo đề xuất SA)
**Ngày:** 2026-10-02

## Bối cảnh
ISSUE-002 (BR-ANALYTICS-01, chờ PO chốt cách đếm) yêu cầu endpoint `GET /workspaces/:workspaceId/analytics/overview?period=7d|month|year` trả 3 chỉ số kèm % thay đổi so kỳ liền trước: (1) tin nhắn đã gửi, (2) mẫu tin đang hoạt động = số `Template` `APPROVED`, (3) tỷ lệ gửi thành công = SUCCESS/(SUCCESS+FAILED). Nguồn dữ liệu nằm ở hai module: `MessageLog` (module messaging) và `Template` (module templates).

Hiện không có endpoint analytics/overview nào trong `src/`. Index sẵn có: `MessageLog @@index([workspaceId, sentAt])`, `Template @@index([workspaceId, status])`.

## Các phương án đã cân nhắc
### Phương án A: Module `analytics/` mới, chỉ đọc
- Controller + service riêng, query trực tiếp `MessageLog` và `Template` qua `PrismaService`.
- Ưu điểm: chỉ số span hai module (messaging + templates); đặt ở module trung lập tránh một module nghiệp vụ phải với sang bảng của module khác; gom các chỉ số dashboard tương lai về một chỗ.
- Nhược điểm: thêm một module cho bề mặt nhỏ.
- Tham chiếu: tách read-model/reporting khỏi module ghi là pattern CQRS-nhẹ thường dùng cho endpoint dashboard tổng hợp.

### Phương án B: Đặt trong module `messaging/`
- Ưu điểm: không thêm module; phần lớn chỉ số từ `MessageLog`.
- Nhược điểm: chỉ số "mẫu tin APPROVED" thuộc `Template` — messaging phải với sang bảng của templates, mờ ranh giới module; dashboard phình thì messaging gánh thêm concern không thuộc nó.

### Phương án C: Bảng aggregate/cache tính sẵn theo kỳ
- Ưu điểm: giảm tải query khi lưu lượng lớn.
- Nhược điểm: thêm bảng, job cập nhật, rủi ro lệch số với nguồn — thừa so với lưu lượng hiện tại; chỉ là đọc 2 bảng đã có index phù hợp.

## Quyết định
Chọn Phương án A: module `analytics/` mới, read-only, query trực tiếp qua `PrismaService`, không bảng aggregate/cache (loại Phương án C). Endpoint `GET /workspaces/:workspaceId/analytics/overview`, bảo vệ bằng `WorkspaceContextGuard` + `WorkspaceRolesGuard` như các endpoint cấp workspace khác.

Mốc lọc kỳ: dùng `MessageLog.sentAt` cho chỉ số "tin nhắn đã gửi" và "tỷ lệ gửi thành công". `sentAt` là thời điểm gửi thật và là cột đã đánh index `[workspaceId, sentAt]`; bản ghi `PENDING` có `sentAt=null` nên tự loại khỏi đếm theo kỳ, khớp ngữ nghĩa "đã gửi". Chỉ số "mẫu tin đang hoạt động" là snapshot số `Template APPROVED` hiện tại theo workspace.

Semantics đếm ("tin đã gửi" tính mọi bản ghi hay chỉ SUCCESS; cách tính % cho chỉ số snapshot APPROVED) thuộc PO quyết (BR-ANALYTICS-01, câu hỏi mở ở ISSUE-002) — không chốt ở tầng kiến trúc.

## Hệ quả
- Thêm module `analytics/` vào north-star §2.
- Module `analytics/` phụ thuộc `PrismaService`; đọc `MessageLog`, `Template`. Không ghi dữ liệu, không đụng toàn vẹn số dư/credit.
- Cần xem lại khi: số chỉ số/khối lượng truy vấn tăng tới mức query trực tiếp không đạt NFR độ trễ — khi đó cân nhắc Phương án C (materialized view hoặc bảng aggregate + job nền).
