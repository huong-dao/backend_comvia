import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { TransactionsQueryDto } from './dto/transactions-query.dto';
import { WalletService } from './wallet.service';

@Controller('workspaces/:workspaceId/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @UseGuards(WorkspaceContextGuard)
  balance(@Param('workspaceId') workspaceId: string) {
    return this.walletService.getBalance(workspaceId);
  }

  @Get('transactions')
  @UseGuards(WorkspaceContextGuard)
  transactions(
    @Param('workspaceId') workspaceId: string,
    @Query() query: TransactionsQueryDto,
  ) {
    return this.walletService.listTransactions(workspaceId, {
      type: query.type,
      types: query.types,
      status: query.status,
      fromDate: query.fromDate,
      toDate: query.toDate,
      offset: query.offset,
      limit: query.limit,
    });
  }
}
