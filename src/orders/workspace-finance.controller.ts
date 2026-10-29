import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { OrdersInvoicesService } from './orders-invoices.service';

@Controller('workspaces/:workspaceId')
@UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
@WorkspaceRoles(MemberRole.OWNER)
export class WorkspaceFinanceController {
  constructor(private readonly ordersInvoicesService: OrdersInvoicesService) {}

  @Get('orders')
  listOrders(@Param('workspaceId') workspaceId: string) {
    return this.ordersInvoicesService.listOrdersForOwner(workspaceId);
  }

  @Get('orders/:orderId')
  getOrder(
    @Param('workspaceId') workspaceId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersInvoicesService.getOrderForOwner(workspaceId, orderId);
  }
}
