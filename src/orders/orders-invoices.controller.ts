import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { OrdersInvoicesService } from './orders-invoices.service';

@Controller('workspaces/:workspaceId')
export class OrdersInvoicesController {
  constructor(private readonly service: OrdersInvoicesService) {}

  @Get('orders')
  @UseGuards(WorkspaceContextGuard)
  listOrders(@Param('workspaceId') workspaceId: string) {
    return this.service.listOrders(workspaceId);
  }

  @Get('orders/:orderId')
  @UseGuards(WorkspaceContextGuard)
  getOrder(
    @Param('workspaceId') workspaceId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.service.getOrder(workspaceId, orderId);
  }

  @Get('invoices')
  @UseGuards(WorkspaceContextGuard)
  listInvoices(@Param('workspaceId') workspaceId: string) {
    return this.service.listInvoices(workspaceId);
  }

  @Get('invoices/:invoiceId')
  @UseGuards(WorkspaceContextGuard)
  getInvoice(
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.service.getInvoice(workspaceId, invoiceId);
  }
}
