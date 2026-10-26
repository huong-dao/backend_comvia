# ADR-002: Chiến lược lưu trữ file (ảnh OA, PDF hóa đơn)

**Trạng thái:** Accepted (2026-10-02, chốt theo đề xuất SA)
**Ngày:** 2026-10-02

## Bối cảnh
ISSUE-003 yêu cầu lưu `avatar`, `logoLight` (400x96), `logoDark` (400x96) cho OA profile và validate kích thước ở backend. Cần chốt nơi lưu file.

Hiện trạng đã verify trong code: file nhị phân (PDF hóa đơn) lưu bằng `InvoicePdfStorageService` (`src/orders/invoice-pdf-storage.service.ts`) ghi vào đĩa cục bộ dưới `public/invoices/<invoiceId>/`, trả URL tương đối `/public/...`. `main.ts` phục vụ tĩnh thư mục `public/` tại prefix `/public/` (`useStaticAssets`). `@aws-sdk/client-s3` có trong `package.json` nhưng không được dùng ở bất kỳ file nào trong `src/`. Tức chiến lược lưu file thực tế đang chạy là đĩa cục bộ, không phải S3 (north-star và coding-convention mô tả S3 là chưa khớp thực tế).

CSV upload của campaign (`FileInterceptor`) xử lý trong bộ nhớ, không lưu file.

## Các phương án đã cân nhắc
### Phương án A: Đĩa cục bộ dưới `public/`, theo đúng pattern `InvoicePdfStorageService`
- Lưu ảnh OA vào `public/oa/<workspaceId>/`, trả URL `/public/oa/...`, phục vụ qua static assets sẵn có.
- Ưu điểm: dùng lại pattern đang chạy production, không thêm hạ tầng; đơn giản đúng quy mô modular monolith/lưu lượng hiện tại; ảnh OA là file nhỏ, ít.
- Nhược điểm: file nằm trên filesystem của instance — không chia sẻ khi scale nhiều instance, mất khi redeploy nếu không mount volume bền. Chấp nhận được ở quy mô một instance hiện tại.
- Tham chiếu: chính `InvoicePdfStorageService` của dự án.

### Phương án B: AWS S3 qua `@aws-sdk/client-s3`
- Upload ảnh lên bucket S3, lưu URL tuyệt đối.
- Ưu điểm: bền khi scale ngang nhiều instance, không phụ thuộc filesystem instance.
- Nhược điểm: S3 chưa từng được dựng/dùng thực tế dù có dependency — chọn phương án này nghĩa là dựng mới hạ tầng (bucket, credential, config, signed URL), vượt nhu cầu hiện tại cho một tính năng ảnh nhỏ; mâu thuẫn nguyên tắc ưu tiên đơn giản khi ràng buộc scale chưa xuất hiện.

## Quyết định
Chọn Phương án A cho ISSUE-003. Tách một `FileStorageService` dùng chung trong `common/` (hoặc tái dùng pattern của `InvoicePdfStorageService`) để ghi ảnh OA xuống `public/oa/<workspaceId>/` và trả URL `/public/...`. Validate kích thước 400x96 cho `logoLight`/`logoDark` tại service trước khi ghi, dùng thư viện đọc kích thước ảnh nhẹ (`image-size`) — chưa có trong dependency, thêm mới; không kéo `sharp` (native build) vì chỉ cần đọc kích thước, không xử lý ảnh. Giới hạn mimetype (png/jpeg) và dung lượng tối đa ở `FileInterceptor`/service.

Giữ nguyên S3 ở trạng thái dependency chưa dùng; không dựng S3 trong phạm vi này.

## Hệ quả
- North-star §1/§3/§4 và coding-convention mô tả S3 là tích hợp đang chạy — không khớp thực tế (đĩa cục bộ). Mô tả as-is của hệ thống được chỉnh để phản ánh: lưu file = đĩa cục bộ dưới `public/`, S3 là dependency dự phòng chưa dùng.
- ADR-001 đọc kèm ADR này cho phần lưu ảnh OA profile.
- Thêm dependency `image-size`. Thêm `FileStorageService` dùng chung là pattern xuyên suốt → ghi vào coding-convention (phần Kiến trúc).
- Cần xem lại khi: triển khai nhiều instance hoặc container không có volume bền cho `public/` — khi đó chuyển sang Phương án B (S3) cho toàn bộ file (ảnh OA + PDF hóa đơn), vì ràng buộc scale lúc đó mới thực sự xuất hiện.
