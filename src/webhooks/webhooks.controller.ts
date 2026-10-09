import {
  Body,
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TopupsService } from '../topups/topups.service';

@Public()
@Controller('webhooks') // Đường dẫn sẽ là /api/v1/webhooks (nếu có set global prefix)
export class WebhooksController {
  constructor(private readonly topupsService: TopupsService) {}

  // Pay2S có 2 cơ chế báo giao dịch khác nhau, cả hai đều có thể gọi vào
  // cùng 1 URL: "Instant Payment Notification" (gắn với Collection Link,
  // body phẳng có orderId/resultCode/m2signature) và "WebHook" (thông báo
  // biến động tài khoản ngân hàng, body có mảng `transactions`, xác thực
  // bằng header Authorization: Bearer <token>). Dùng `any` ở đây để né
  // ValidationPipe toàn cục (chỉ áp dụng được 1 DTO cố định cho @Body),
  // rồi tự phân loại + validate thủ công theo từng nhánh bên service.
  @Post('pay2s')
  @HttpCode(HttpStatus.OK) // Luôn trả về 200 cho Pay2S
  async handlePay2s(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    console.log('Nhận webhook từ Pay2S:', body);

    if (Array.isArray(body?.transactions)) {
      return await this.topupsService.handlePay2sBankTransactionWebhook(
        body.transactions,
        authorization,
      );
    }

    return await this.topupsService.handlePay2sWebhook(body);
  }
}
