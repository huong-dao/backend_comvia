import { Module } from '@nestjs/common';
import { MoneyAccountsController } from './money-accounts.controller';
import { PublicMoneyAccountsController } from './public-money-accounts.controller';
import { MoneyAccountsService } from './money-accounts.service';

@Module({
  controllers: [MoneyAccountsController, PublicMoneyAccountsController],
  providers: [MoneyAccountsService],
  exports: [MoneyAccountsService],
})
export class MoneyAccountsModule {}
