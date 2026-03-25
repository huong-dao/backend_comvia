import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrdersInvoicesService {
  constructor(private readonly prismaService: PrismaService) {}

  listOrders(workspaceId: string) {
    return this.prismaService.order.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderCode: true,
        orderType: true,
        currency: true,
        totalAmountExclVat: true,
        totalVatAmount: true,
        totalAmountInclVat: true,
        status: true,
        paidAt: true,
        createdAt: true,
      },
    });
  }

  getOrder(workspaceId: string, orderId: string) {
    return this.prismaService.order.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        items: true,
        invoice: true,
      },
    });
  }

  listInvoices(workspaceId: string) {
    return this.prismaService.invoice.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceCode: true,
        invoiceNumber: true,
        status: true,
        issueDate: true,
        invoicePdfUrl: true,
        billingType: true,
        billingSnapshotJson: true,
        createdAt: true,
      },
    });
  }

  getInvoice(workspaceId: string, invoiceId: string) {
    return this.prismaService.invoice.findFirst({
      where: { id: invoiceId, workspaceId },
      include: { items: true, order: true },
    });
  }
}
