import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { OrdersInvoicesService } from './orders-invoices.service';

@Controller('admin')
@Roles(UserRole.ADMIN)
export class OrdersInvoicesController {
  constructor(private readonly service: OrdersInvoicesService) {}

  @Get('orders')
  listOrders(@Query() query: AdminOrdersQueryDto) {
    return this.service.listOrdersForAdmin(query);
  }

  @Get('orders/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    return this.service.getOrderForAdmin(orderId);
  }
}
