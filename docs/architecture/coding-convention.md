# Coding Convention — Comvia Backend

> Hợp nhất từ `.cursor/rules/development-guidelines.mdc` và mục 6 của `.cursor/rules/project-overview.mdc` (đã xóa sau khi hợp nhất). Đây là quy ước đang có hiệu lực trên codebase hiện tại, không phải đề xuất mới.

## Kiến trúc (SA sở hữu)

- Cấu trúc thư mục NestJS Modular: `auth/` (JWT, OTP), `topups/` (logic nạp tiền Pay2S), `messaging/` (logic gửi tin chung), `oa/` (kết nối Zalo OA), `wallet/` (số dư và giao dịch), `modules/` (các module mở rộng), `prisma/` (PrismaService và DB client), `integrations/` (SDK/util kết nối bên thứ 3: Pay2S...), `common/` (guards, interceptors, decorators dùng chung). — *thêm bởi: SA*
- Quy trình thêm resource mới: (1) định nghĩa Model trong `prisma/schema.prisma`; (2) `npx prisma generate`; (3) tạo `module`/`service` (logic nghiệp vụ đặt hoàn toàn trong Service); (4) tạo `dto/create-x.dto.ts` và `dto/update-x.dto.ts` bằng `class-validator`; (5) tạo Controller, áp dụng Guards/Decorators phù hợp; (6) khai báo Module vào `app.module.ts`. — *thêm bởi: SA*
- Pattern **Service-heavy**: Controller chỉ điều hướng, parse params/body, gọi Service — không viết logic nghiệp vụ tại Controller. Service tập trung toàn bộ logic xử lý, tính toán, tương tác database qua `PrismaService`. — *thêm bởi: SA*
- Transaction: mọi thao tác thay đổi dữ liệu liên quan nhiều bảng, đặc biệt Tiền/Ví (Wallet, Topup, Order), **bắt buộc** bọc trong `this.prismaService.$transaction`. — *thêm bởi: SA*
- Dependency Injection: luôn inject qua `constructor`; không `new` cho class có decorator `@Injectable()`. — *thêm bởi: SA*
- Tích hợp bên thứ ba (Pay2S, Zalo, Gemini, email): toàn bộ logic SDK/API đặt trong `src/integrations/`; tạo util/Service riêng cho từng tích hợp để dễ bảo trì và mock khi test. Cấu hình API key/secret khai báo trong `src/config/`, truy cập qua `ConfigService`. — *thêm bởi: SA*
- Lưu trữ file (PDF hóa đơn, ảnh OA): ghi xuống đĩa cục bộ dưới `public/<loại>/`, trả URL tương đối `/public/...` (phục vụ tĩnh qua `useStaticAssets`); gom logic ghi/đọc file vào một `FileStorageService` dùng chung (theo pattern `InvoicePdfStorageService`). Validate kích thước/mimetype ảnh ở service trước khi ghi. Không dùng S3 (ADR-002). — *thêm bởi: SA*
- API URL structure: `/api/v1/<resource>` — global prefix `api/v1` set ở `main.ts` (`setGlobalPrefix`); path trong `@Controller('resource')` là phần sau prefix. — *thêm bởi: SA*
- Authorization: mặc định mọi API yêu cầu JWT (`@Public()` cho route công khai); API thao tác trong workspace dùng `@UseGuards(WorkspaceHeaderGuard, WorkspaceRolesGuard)`, header bắt buộc `x-workspace-id`. — *thêm bởi: SA*
- Error handling: bắt lỗi tại Service nếu cần fallback logic; để lỗi bubble lên Controller cho `GlobalExceptionFilter` xử lý trả về client; **tuyệt đối không nuốt lỗi** (catch mà không làm gì hoặc không throw lại). — *thêm bởi: SA*

## Thực thi & style (Team Lead bổ sung)

- Naming: file `kebab-case.module.ts`/`kebab-case.service.ts`; class `PascalCase` (vd `TopupsService`); biến/hàm `camelCase`. — *thêm bởi: Team Lead*
- Prisma/DB: Model `PascalCase`, field `camelCase` (map `snake_case` trong Postgres nếu cần qua `@map`); Primary Key luôn `@id @default(cuid())`; luôn có `createdAt DateTime @default(now())` và `updatedAt DateTime @updatedAt`. — *thêm bởi: Team Lead*
- Migration: luôn dùng `npx prisma migrate dev --name <description>`; không sửa trực tiếp DB ngoài migration. — *thêm bởi: Team Lead*
- Query: hạn chế `include` quá sâu (>2 cấp) — ưu tiên tách query hoặc dùng `select` lấy đúng trường cần. — *thêm bởi: Team Lead*
- Validation: `ValidationPipe` bật toàn cục; bắt buộc dùng DTO với `class-validator` (`@IsString`, `@IsNotEmpty`, `@IsNumber`...). — *thêm bởi: Team Lead*
- Response: thành công trả object/array trực tiếp (NestJS tự wrap JSON 200/201); thất bại dùng `HttpException` (`BadRequestException`, `ForbiddenException`...). — *thêm bởi: Team Lead*
- Logging: dùng NestJS `Logger` cho module quan trọng; nếu dùng `console.log/error` phải có prefix để dễ track (vd `[Pay2S Webhook] Error: ...`). — *thêm bởi: Team Lead*
- Strict typing: luôn khai báo kiểu cho biến và giá trị trả về; tránh `any`. — *thêm bởi: Team Lead*
- Luôn `async/await` khi làm việc với DB/API call; tránh `.then().catch()`. — *thêm bởi: Team Lead*
- Luôn check biến môi trường tồn tại qua `ConfigService` trước khi dùng. — *thêm bởi: Team Lead*
- DRY: tách logic lặp lại (tính số dư, verify signature...) thành helper trong `common/` hoặc `utils`. — *thêm bởi: Team Lead*

## Gate khách quan (lệnh thật của project)

- Typecheck/build: `npm run build`
- Lint: `npm run lint`
- Unit test: `npm run test`
- E2E test: `npm run test:e2e`
