import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { TopupsService } from '../topups/topups.service';
import { Pay2SWebhookDto } from '../topups/dto/pay2s-webhook.dto';

@Public()
@Controller('webhooks') // Đường dẫn sẽ là /api/v1/webhooks (nếu có set global prefix)
export class WebhooksController {
  constructor(private readonly topupsService: TopupsService) {}

  @Post('pay2s')
  @HttpCode(HttpStatus.OK) // Luôn trả về 200 cho Pay2S
  async handlePay2s(@Body() dto: Pay2SWebhookDto) {
    console.log('Nhận webhook từ Pay2S:', dto);
    return await this.topupsService.handlePay2sWebhook(dto);
  }
}
