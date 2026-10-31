# ISSUE-005: Cho phép đổi mẫu tin (templateId) của campaign khi chưa gửi lần nào

**Trạng thái:** Đã xử lý (BE)
**Phân loại:** Change Request
**Màn hình/route liên quan:** `app/app/w/[workspaceId]/campaigns/[campaignId]` — trang chi tiết campaign (field "Chọn mẫu")

## Mô tả gốc từ khách hàng/PO
"Khi chiến dịch chưa từng gửi lần nào thì field Chọn mẫu tin có thể chọn lại. Khi chọn lại thì data khi bấm vào nút 'Tải CSV mẫu' cũng sẽ đổi theo. Bên phải sẽ có block 'Xem trước' hiển thị theo template đã và đang chọn."

Khi được hỏi cách xử lý vì API hiện không hỗ trợ, PO xác nhận: cứ làm UI chọn mẫu, gọi `PATCH` kèm `templateId`, rồi ghi lại thông tin này để backend biết cần sửa gì theo đúng ý FE (issue này).

## Rule/API hiện tại
`docs/FRONTEND_API_GUIDE_NEXTJS.mdc` mục 7.7:
> `PATCH /workspaces/:workspaceId/campaigns/:campaignId` — chỉ đổi `name` (không đổi template)

## Hành vi thực tế đã verify
- `app/app/w/[workspaceId]/campaigns/[campaignId]/page.tsx` hàm `changeTemplate()`: FE đã gửi `PATCH /workspaces/:workspaceId/campaigns/:campaignId` với body `{ "templateId": "<id mới>" }` khi user đổi lựa chọn ở field "Chọn mẫu" (chỉ hiển thị field này khi campaign chưa có `lastRunAt`, tức chưa gửi lần nào).
- Theo tài liệu hiện tại, BE sẽ bỏ qua field `templateId` trong body này (chỉ xử lý `name`) → đổi mẫu trên UI sẽ không có tác dụng thật cho tới khi BE hỗ trợ.
- `GET .../csv-template` và block "Xem trước" ở FE đều đã sẵn sàng phản ánh đúng mẫu tin đang chọn ngay khi `campaign.templateId` được BE cập nhật — không cần sửa thêm ở FE một khi BE chấp nhận field này.

## Hành vi mong đợi
`PATCH /workspaces/:workspaceId/campaigns/:campaignId` chấp nhận thêm field `templateId` trong body, với điều kiện áp dụng tương tự rule tạo campaign (mục 7.7: template phải `APPROVED`), và **chỉ cho đổi khi campaign chưa từng chạy** (chưa có `lastRunAt` / chưa có run nào) — vì sau khi đã có `CampaignRow` gắn với placeholder của mẫu cũ, đổi mẫu có thể làm lệch cột dữ liệu đã nhập.

Đề xuất cụ thể:
- Nếu campaign **chưa có `CampaignRow` nào** (`rowCount = 0`): cho đổi `templateId` tự do (miễn template mới `APPROVED`).
- Nếu campaign **đã có `CampaignRow` nhưng chưa execute lần nào**: FE không có cách chắc chắn phân biệt "đã import CSV nhưng chưa gửi" — cần BE xác nhận có cho đổi mẫu trong trường hợp này không, hay yêu cầu xóa hết rows trước (xem CÂU HỎI MỞ).
- Nếu campaign **đã từng execute** (`lastRunAt` khác null): từ chối `400`, đúng như rule cấm đổi template hiện tại.

## Phân tích tác động
- Không ảnh hưởng trang tạo campaign (`campaigns/new`) — trang đó vẫn tạo mới với `templateId` cố định từ đầu, không đổi.
- Ảnh hưởng tới cột `placeholderKeys` hiển thị ở bảng dữ liệu campaign (lấy từ `campaign.template.placeholdersJson`) và file CSV mẫu/hiện tại tải về — các cột này sẽ đổi theo mẫu mới ngay khi BE cập nhật `templateId`, FE không cần sửa thêm.

## Giả định / Câu hỏi mở (đã chốt)
CÂU HỎI MỞ: Nếu campaign đã có `CampaignRow` (đã import CSV) nhưng chưa execute, đổi `templateId` có được phép không?

**Quyết định:** Cho phép đổi tự do trong mọi trường hợp campaign chưa execute (`lastRunAt == null`, không `RUNNING`), bất kể đã có `CampaignRow` hay chưa — nhất quán với hành vi `import-csv` vốn đã thay toàn bộ rows mỗi lần import trước khi execute (`campaigns.service.ts` `importCsv()` luôn `deleteMany` rồi tạo lại). Khi đổi `templateId`, BE xóa luôn toàn bộ `CampaignRow` hiện có (nếu có) thay vì giữ lại dữ liệu lệch cột hoặc bắt FE tự xóa trước — tránh thêm round-trip và nhất quán với `import-csv`.

## Hướng xử lý (đã triển khai)
- `UpdateCampaignDto`: `name` và `templateId` đều optional (trước đây `name` bắt buộc, khiến PATCH chỉ gửi `templateId` của FE bị 400 vì validation).
- `CampaignsService.update()`: khi `templateId` đổi khác giá trị hiện tại — chặn nếu `status === 'RUNNING'` hoặc `lastRunAt != null` (400); validate template mới `APPROVED` + OA `CONNECTED` qua `getApprovedTemplateOrThrow` (rule giống `create()`); trong transaction: xóa hết `CampaignRow`, cập nhật `templateId`, `oaConnectionId`, `unitPriceAtCreate` theo template mới, reset `status` về `DRAFT` và các counter (`totalData`, `totalValid`, `totalInvalid`, `totalPending`, `totalSuccess`, `totalFailed`, `estimatedTotalAmount`) về 0.
- Cập nhật `docs/FRONTEND_API_GUIDE_NEXTJS.mdc` mục 7.7 phản ánh hành vi mới.
- FE không cần sửa gì thêm — `changeTemplate()` đã gửi đúng `PATCH { templateId }`; `GET .../csv-template` và block "Xem trước" tự phản ánh theo `campaign.templateId` mới. Lưu ý FE: sau khi đổi mẫu, `CampaignRow` bị xóa hết nên cần nhắc user import lại CSV.
