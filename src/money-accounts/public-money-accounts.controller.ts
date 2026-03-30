import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MoneyAccountsService } from './money-accounts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('public/money-accounts')
@UseGuards(JwtAuthGuard)
export class PublicMoneyAccountsController {
  constructor(private readonly moneyAccountsService: MoneyAccountsService) {}

  @Get('active-for-topup')
  @HttpCode(HttpStatus.OK)
  async getActiveAccountsForTopup() {
    const accounts =
      await this.moneyAccountsService.getActiveAccountsForTopup(
        'default-workspace',
      );
    return {
      success: true,
      data: accounts,
      message: 'Active accounts for topup retrieved successfully',
    };
  }
}
