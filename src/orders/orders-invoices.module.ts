import { Module } from '@nestjs/common';
import { OrdersInvoicesController } from './orders-invoices.controller';
import { OrdersInvoicesService } from './orders-invoices.service';
import { WorkspaceFinanceController } from './workspace-finance.controller';

@Module({
  controllers: [OrdersInvoicesController, WorkspaceFinanceController],
  providers: [OrdersInvoicesService],
})
export class OrdersInvoicesModule {}
