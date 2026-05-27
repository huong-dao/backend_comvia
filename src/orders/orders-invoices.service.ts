import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminInvoicesQueryDto } from './dto/admin-invoices-query.dto';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';

@Injectable()
export class OrdersInvoicesService {
  constructor(private readonly prismaService: PrismaService) {}

  private buildOrderWhere(query: AdminOrdersQueryDto): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }
    if (query.ownerUserId) {
      where.ownerUserId = query.ownerUserId;
    }
    if (query.status !== undefined) {
      where.status = query.status;
    }
    if (query.orderCode) {
      where.orderCode = {
        contains: query.orderCode,
        mode: 'insensitive',
      };
    }
    if (query.topupRequestId) {
      where.topupRequestId = query.topupRequestId;
    }
    if (query.paidAtFrom !== undefined || query.paidAtTo !== undefined) {
      where.paidAt = {};
      if (query.paidAtFrom) {
        where.paidAt.gte = new Date(query.paidAtFrom);
      }
      if (query.paidAtTo) {
        where.paidAt.lte = new Date(query.paidAtTo);
      }
    }
    if (query.createdAtFrom !== undefined || query.createdAtTo !== undefined) {
      where.createdAt = {};
      if (query.createdAtFrom) {
        where.createdAt.gte = new Date(query.createdAtFrom);
      }
      if (query.createdAtTo) {
        where.createdAt.lte = new Date(query.createdAtTo);
      }
    }

    return where;
  }

  private buildInvoiceWhere(
    query: AdminInvoicesQueryDto,
  ): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {};

    if (query.workspaceId) {
      where.workspaceId = query.workspaceId;
    }
    if (query.orderId) {
      where.orderId = query.orderId;
    }
    if (query.status !== undefined) {
      where.status = query.status;
    }
    if (query.billingType !== undefined) {
      where.billingType = query.billingType;
    }
    if (query.invoiceCode) {
      where.invoiceCode = query.invoiceCode;
    }
    if (query.issueDateFrom !== undefined || query.issueDateTo !== undefined) {
      where.issueDate = {};
      if (query.issueDateFrom) {
        where.issueDate.gte = new Date(query.issueDateFrom);
      }
      if (query.issueDateTo) {
        where.issueDate.lte = new Date(query.issueDateTo);
      }
    }
    if (query.createdAtFrom !== undefined || query.createdAtTo !== undefined) {
      where.createdAt = {};
      if (query.createdAtFrom) {
        where.createdAt.gte = new Date(query.createdAtFrom);
      }
      if (query.createdAtTo) {
        where.createdAt.lte = new Date(query.createdAtTo);
      }
    }

    return where;
  }

  async listOrdersForAdmin(query: AdminOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where = this.buildOrderWhere(query);

    const [data, total] = await Promise.all([
      this.prismaService.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          orderCode: true,
          workspaceId: true,
          ownerUserId: true,
          totalAmountExclVat: true,
          totalVatAmount: true,
          totalAmountInclVat: true,
          status: true,
          paidAt: true,
          topupRequestId: true,
          createdAt: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              ownerUserId: true,
              createdAt: true,
            },
          },
          owner: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prismaService.order.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrderForAdmin(orderId: string) {
    const order = await this.prismaService.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        invoice: true,
        topupRequest: {
          select: {
            id: true,
            topupCode: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
            createdAt: true,
          },
        },
        owner: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async listInvoicesForAdmin(query: AdminInvoicesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where = this.buildInvoiceWhere(query);

    const [data, total] = await Promise.all([
      this.prismaService.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          invoiceCode: true,
          invoiceNumber: true,
          workspaceId: true,
          orderId: true,
          status: true,
          issueDate: true,
          invoicePdfUrl: true,
          billingType: true,
          billingSnapshotJson: true,
          createdAt: true,
        },
      }),
      this.prismaService.invoice.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getInvoiceForAdmin(invoiceId: string) {
    const invoice = await this.prismaService.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        order: {
          select: {
            id: true,
            orderCode: true,
            totalAmountExclVat: true,
            totalVatAmount: true,
            totalAmountInclVat: true,
            status: true,
            paidAt: true,
            createdAt: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }
}
