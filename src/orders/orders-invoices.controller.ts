import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminInvoicesQueryDto } from './dto/admin-invoices-query.dto';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { VerifyIssueInvoicePdfBodyDto } from './dto/verify-issue-invoice-pdf-body.dto';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import { INVOICE_PDF_MAX_BYTES } from './invoice-pdf-verification.constants';
import type { UploadedInvoicePdfFile } from './invoice-pdf-verification.types';
import { InvoicePdfVerificationService } from './invoice-pdf-verification.service';
import { OrdersInvoicesService } from './orders-invoices.service';

@Controller('admin')
@Roles(UserRole.ADMIN)
export class OrdersInvoicesController {
  constructor(
    private readonly service: OrdersInvoicesService,
    private readonly invoicePdfVerificationService: InvoicePdfVerificationService,
    private readonly invoicePdfStorageService: InvoicePdfStorageService,
  ) {}

  @Get('orders')
  listOrders(@Query() query: AdminOrdersQueryDto) {
    return this.service.listOrdersForAdmin(query);
  }

  @Get('orders/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    return this.service.getOrderForAdmin(orderId);
  }

  @Get('invoices')
  listInvoices(@Query() query: AdminInvoicesQueryDto) {
    return this.service.listInvoicesForAdmin(query);
  }

  @Get('invoices/:invoiceId')
  getInvoice(@Param('invoiceId') invoiceId: string) {
    return this.service.getInvoiceForAdmin(invoiceId);
  }

  @Get('invoices/:invoiceId/pdf')
  async downloadInvoicePdf(
    @Param('invoiceId') invoiceId: string,
  ): Promise<StreamableFile> {
    const invoice = await this.service.getInvoiceForAdmin(invoiceId);
    if (invoice.status !== 'ISSUED' || !invoice.invoicePdfUrl) {
      throw new NotFoundException('Issued invoice PDF not found');
    }

    try {
      const buffer = await this.invoicePdfStorageService.readInvoicePdf(
        invoice.invoicePdfUrl,
      );
      return new StreamableFile(buffer, {
        disposition: `attachment; filename="${invoice.invoiceNumber ?? invoice.invoiceCode}.pdf"`,
        type: 'application/pdf',
      });
    } catch {
      throw new NotFoundException('Issued invoice PDF not found');
    }
  }

  @Post('invoices/:invoiceId/verify-issue-pdf')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: INVOICE_PDF_MAX_BYTES },
    }),
  )
  verifyIssuePdf(
    @Request() req: { user: { id: string } },
    @Param('invoiceId') invoiceId: string,
    @UploadedFile() file: UploadedInvoicePdfFile,
    @Body() body: VerifyIssueInvoicePdfBodyDto,
  ) {
    return this.invoicePdfVerificationService.verifyAndIssueInvoicePdf({
      invoiceId,
      actorUserId: req.user.id,
      file,
      invoiceNumber: body.invoiceNumber,
      issueDate: body.issueDate,
      idempotencyKey: body.idempotencyKey,
    });
  }
}
