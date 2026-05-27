import { Module } from '@nestjs/common';
import { GeminiInvoicePdfService } from '../integrations/gemini/gemini-invoice-pdf.service';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import { InvoicePdfVerificationService } from './invoice-pdf-verification.service';
import { OrdersInvoicesController } from './orders-invoices.controller';
import { OrdersInvoicesService } from './orders-invoices.service';

@Module({
  controllers: [OrdersInvoicesController],
  providers: [
    OrdersInvoicesService,
    InvoicePdfVerificationService,
    InvoicePdfStorageService,
    GeminiInvoicePdfService,
  ],
})
export class OrdersInvoicesModule {}
