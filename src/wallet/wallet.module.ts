import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { WalletLowBalanceWorker } from './wallet-low-balance.worker';
import { EmailModule } from '../integrations/email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [WalletController],
  providers: [WalletService, WalletLedgerService, WalletLowBalanceWorker],
  exports: [WalletService, WalletLedgerService],
})
export class WalletModule {}
