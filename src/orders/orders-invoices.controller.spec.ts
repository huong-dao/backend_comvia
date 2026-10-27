import { NotFoundException } from '@nestjs/common';
import { InvoiceStatus, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { OrdersInvoicesController } from './orders-invoices.controller';

describe('OrdersInvoicesController authorization', () => {
  it('allows only ADMIN to access order and invoice operations', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OrdersInvoicesController)).toEqual([
      UserRole.ADMIN,
    ]);
  });
});

describe('OrdersInvoicesController admin PDF download', () => {
  const issuedInvoice = {
    status: InvoiceStatus.ISSUED,
    invoicePdfUrl: 'invoices/invoice-1/invoice.pdf',
    invoiceNumber: 'INV-001',
    invoiceCode: 'INVOICE-001',
  };

  it('reads the private PDF only after loading the admin invoice', async () => {
    const service = {
      getInvoiceForAdmin: jest.fn().mockResolvedValue(issuedInvoice),
    };
    const storage = {
      readInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const controller = new OrdersInvoicesController(
      service as never,
      {} as never,
      storage as never,
    );

    await controller.downloadInvoicePdf('invoice-1');

    expect(service.getInvoiceForAdmin).toHaveBeenCalledWith('invoice-1');
    expect(storage.readInvoicePdf).toHaveBeenCalledWith(
      issuedInvoice.invoicePdfUrl,
    );
  });

  it('does not read a missing or non-issued invoice PDF', async () => {
    const service = {
      getInvoiceForAdmin: jest.fn().mockResolvedValue({
        ...issuedInvoice,
        status: InvoiceStatus.POSTED,
      }),
    };
    const storage = { readInvoicePdf: jest.fn() };
    const controller = new OrdersInvoicesController(
      service as never,
      {} as never,
      storage as never,
    );

    await expect(
      controller.downloadInvoicePdf('invoice-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.readInvoicePdf).not.toHaveBeenCalled();
  });
});
