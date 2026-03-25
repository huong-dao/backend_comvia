import { Module } from '@nestjs/common';
import { OrdersInvoicesController } from './orders-invoices.controller';
import { OrdersInvoicesService } from './orders-invoices.service';

@Module({
  controllers: [OrdersInvoicesController],
  providers: [OrdersInvoicesService],
})
export class OrdersInvoicesModule {}
