import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { InvoiceStatus, MemberRole } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import { OrdersInvoicesService } from './orders-invoices.service';

@Controller('workspaces/:workspaceId')
@UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
@WorkspaceRoles(MemberRole.OWNER)
export class WorkspaceFinanceController {
  constructor(
    private readonly ordersInvoicesService: OrdersInvoicesService,
    private readonly invoicePdfStorageService: InvoicePdfStorageService,
  ) {}

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

  @Get('invoices')
  listInvoices(@Param('workspaceId') workspaceId: string) {
    return this.ordersInvoicesService.listInvoicesForOwner(workspaceId);
  }

  @Get('invoices/:invoiceId')
  getInvoice(
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.ordersInvoicesService.getInvoiceForOwner(
      workspaceId,
      invoiceId,
    );
  }

  @Get('invoices/:invoiceId/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(
    @Param('workspaceId') workspaceId: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    const invoice = await this.ordersInvoicesService.getInvoiceForOwner(
      workspaceId,
      invoiceId,
    );
    if (invoice.status !== InvoiceStatus.ISSUED || !invoice.invoicePdfUrl) {
      throw new NotFoundException('Issued invoice PDF not found');
    }
    try {
      const buffer = await this.invoicePdfStorageService.readInvoicePdf(
        invoice.invoicePdfUrl,
      );
      return new StreamableFile(buffer, {
        disposition: `attachment; filename="${invoice.invoiceNumber ?? invoice.invoiceCode}.pdf"`,
      });
    } catch {
      throw new NotFoundException('Issued invoice PDF not found');
    }
  }
}
