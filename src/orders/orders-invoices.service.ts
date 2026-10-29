import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

  listOrdersForOwner(workspaceId: string) {
    return this.prismaService.order.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }

  async getOrderForOwner(workspaceId: string, orderId: string) {
    const order = await this.prismaService.order.findFirst({
      where: { id: orderId, workspaceId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
