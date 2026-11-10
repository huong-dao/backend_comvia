# Ticket Conventions — Comvia

Quy ước cấp thực thi cho ticket. Thiết lập một lần; sửa khi cần điều chỉnh quy ước.

## Cấu trúc ticket
Mỗi ticket ở `docs/tickets/TICKET-{id}.md` theo khung của skill `ticket-format`:
- Header: `Issue`, `Rule/Thiết kế liên quan`, `Độ ưu tiên`, `Phụ thuộc vào`.
- `Mục tiêu` — một câu.
- `Chỉ dẫn code` — function/method/endpoint, entity/bảng Prisma, các bước theo thứ tự, convention áp dụng.
- `Acceptance Criteria (cấp code)` — checklist kiểm chứng được.
- `Definition of Done` — theo mục dưới.

Mỗi ticket link ngược về `ISSUE-{id}` và tài liệu thiết kế (ADR / component-design / interface-spec) mà nó cụ thể hóa. Ticket không chứa quyết định kiến trúc mới; nếu cần một quyết định như vậy, escalate về SA qua `docs/handoff/open-items.md`.

## Definition of Done (chung, cấp ticket)
Một ticket chỉ Done khi đủ tất cả:
1. **Code** hoàn tất đúng chỉ dẫn, không lệch khỏi rule/thiết kế được trích.
2. **Test** — unit test bắt buộc cho logic nghiệp vụ mới (service/method). Theo convention test hiện có của repo: `*.spec.ts` cạnh file nguồn, `Test.createTestingModule` với PrismaService (và service phụ thuộc) được mock, không cần DB thật. E2e (`test/*.e2e-spec.ts`, supertest + prisma mock + guard override) chỉ bắt buộc khi controller có logic riêng (filter/query/transform); controller pass-through thuần không bắt buộc e2e.
3. **Lint + build** PASS: `npm run lint` (phạm vi file đụng tới) và `npm run build`.
4. **Convention** — theo `docs/architecture/coding-convention.md`.
5. **Tài liệu** — cập nhật tài liệu liên quan nếu hành vi/đối tượng tài liệu hoá thay đổi (ví dụ thêm hằng số audit đã có trong interface-spec thì không cần sửa docs).

## Trạng thái trên board
`Todo` → `Đang làm` → `Chờ review` → `Done`. Ghi commit/nhánh khi chuyển trạng thái nếu có.

> Lập bởi: Team Lead, 2026-11-10. Chờ PO duyệt chính thức; không chặn việc chẻ ticket.
