import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  GrantWorkspaceSubscriptionDto,
  UpdateWorkspaceSubscriptionDto,
} from './dto/admin-subscription.dto';
import {
  ListWorkspaceSubscriptionsQueryDto,
  SubscriptionState,
} from './dto/list-workspace-subscriptions-query.dto';
import {
  computeSubscriptionPeriod,
  daysRemaining,
  diffDays,
} from './subscription-pricing';

const subscriptionInclude = {
  plan: { select: { id: true, code: true, name: true, durationYears: true } },
  workspace: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      owner: { select: { id: true, email: true, fullName: true } },
    },
  },
  order: { select: { id: true, orderCode: true } },
} satisfies Prisma.WorkspaceSubscriptionInclude;

type SubscriptionRow = Prisma.WorkspaceSubscriptionGetPayload<{
  include: typeof subscriptionInclude;
}>;

function stateOf(row: SubscriptionRow, now: Date): SubscriptionState {
  if (row.status === 'CANCELLED') return 'CANCELLED';
  if (row.endsAt <= now) return 'EXPIRED';
  if (row.startsAt > now) return 'UPCOMING';
  return 'ACTIVE';
}

function toSubscriptionView(row: SubscriptionRow, now: Date) {
  return {
    id: row.id,
    workspace: row.workspace,
    plan: row.plan,
    orderId: row.orderId,
    order: row.order,
    purchaseId: row.purchaseId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    durationDays: row.durationDays,
    status: row.status,
    state: stateOf(row, now),
    daysRemaining: daysRemaining(now, row.endsAt),
    // purchaseId null => admin cấp tay (không qua thanh toán)
    source: row.purchaseId ? 'PURCHASE' : 'ADMIN_GRANT',
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async list(query: ListWorkspaceSubscriptionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const now = new Date();

    const where: Prisma.WorkspaceSubscriptionWhereInput = {};
    if (query.workspaceId) where.workspaceId = query.workspaceId;
    if (query.planId) where.planId = query.planId;
    if (query.keyword) {
      where.workspace = {
        OR: [
          { name: { contains: query.keyword, mode: 'insensitive' } },
          { slug: { contains: query.keyword, mode: 'insensitive' } },
          {
            owner: {
              email: { contains: query.keyword, mode: 'insensitive' },
            },
          },
        ],
      };
    }
    if (query.state === 'CANCELLED') {
      where.status = 'CANCELLED';
    } else if (query.state) {
      where.status = 'ACTIVE';
      if (query.state === 'ACTIVE') {
        where.startsAt = { lte: now };
        where.endsAt = { gt: now };
      } else if (query.state === 'UPCOMING') {
        where.startsAt = { gt: now };
      } else {
        where.endsAt = { lte: now };
      }
    }
    if (query.endsAtFrom || query.endsAtTo) {
      // Kết hợp với điều kiện endsAt của `state` (nếu có) bằng AND.
      where.AND = [
        {
          endsAt: {
            ...(query.endsAtFrom ? { gte: new Date(query.endsAtFrom) } : {}),
            ...(query.endsAtTo ? { lte: new Date(query.endsAtTo) } : {}),
          },
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prismaService.workspaceSubscription.findMany({
        where,
        include: subscriptionInclude,
        orderBy: { endsAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prismaService.workspaceSubscription.count({ where }),
    ]);

    return {
      data: rows.map((row) => toSubscriptionView(row, now)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async get(subscriptionId: string) {
    const row = await this.findOrThrow(subscriptionId);
    return toSubscriptionView(row, new Date());
  }

  /** Admin cấp tay một kỳ subscription (ví dụ workspace cũ chưa có gói). */
  async grant(
    adminUserId: string,
    workspaceId: string,
    dto: GrantWorkspaceSubscriptionDto,
  ) {
    const [workspace, plan] = await Promise.all([
      this.prismaService.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true },
      }),
      this.prismaService.subscriptionPlan.findUnique({
        where: { id: dto.planId },
      }),
    ]);
    if (!workspace) throw new NotFoundException('Không tìm thấy workspace');
    if (!plan) throw new NotFoundException('Không tìm thấy gói subscription');

    const created = await this.prismaService.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`,
      );
      const latest = await tx.workspaceSubscription.aggregate({
        where: { workspaceId, status: 'ACTIVE' },
        _max: { endsAt: true },
      });
      const computed = computeSubscriptionPeriod({
        now: new Date(),
        latestEndsAt: latest._max.endsAt,
        durationYears: plan.durationYears,
      });
      const startsAt = dto.startsAt
        ? new Date(dto.startsAt)
        : computed.startsAt;
      const endsAt = dto.endsAt
        ? new Date(dto.endsAt)
        : dto.startsAt
          ? computeSubscriptionPeriod({
              now: startsAt,
              latestEndsAt: null,
              durationYears: plan.durationYears,
            }).endsAt
          : computed.endsAt;
      this.assertValidRange(startsAt, endsAt);

      const subscription = await tx.workspaceSubscription.create({
        data: {
          workspaceId,
          planId: plan.id,
          startsAt,
          endsAt,
          durationDays: diffDays(startsAt, endsAt),
          grantedByUserId: adminUserId,
          note: dto.note ?? null,
        },
        include: subscriptionInclude,
      });

      await this.auditLogService.write({
        actorUserId: adminUserId,
        workspaceId,
        action: AUDIT_ACTIONS.SUBSCRIPTION_ADMIN_GRANTED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_SUBSCRIPTION,
        resourceId: subscription.id,
        metadataJson: {
          planId: plan.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          note: dto.note ?? null,
        },
        tx,
      });
      return subscription;
    });

    return toSubscriptionView(created, new Date());
  }

  /** Admin sửa gói / ngày bắt đầu / ngày hết hạn / trạng thái của một kỳ. */
  async update(
    adminUserId: string,
    subscriptionId: string,
    dto: UpdateWorkspaceSubscriptionDto,
  ) {
    const existing = await this.findOrThrow(subscriptionId);

    if (dto.planId && dto.planId !== existing.planId) {
      const plan = await this.prismaService.subscriptionPlan.findUnique({
        where: { id: dto.planId },
        select: { id: true },
      });
      if (!plan) throw new NotFoundException('Không tìm thấy gói subscription');
    }

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    this.assertValidRange(startsAt, endsAt);

    const endsAtChanged = endsAt.getTime() !== existing.endsAt.getTime();

    const updated = await this.prismaService.$transaction(async (tx) => {
      const row = await tx.workspaceSubscription.update({
        where: { id: subscriptionId },
        data: {
          ...(dto.planId ? { planId: dto.planId } : {}),
          startsAt,
          endsAt,
          durationDays: diffDays(startsAt, endsAt),
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          grantedByUserId: adminUserId,
          // Đổi ngày hết hạn thì cho phép nhắc lại theo hạn mới.
          ...(endsAtChanged ? { expiryReminderSentAt: null } : {}),
        },
        include: subscriptionInclude,
      });

      await this.auditLogService.write({
        actorUserId: adminUserId,
        workspaceId: existing.workspaceId,
        action: AUDIT_ACTIONS.SUBSCRIPTION_ADMIN_UPDATED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_SUBSCRIPTION,
        resourceId: subscriptionId,
        metadataJson: {
          before: {
            planId: existing.planId,
            startsAt: existing.startsAt.toISOString(),
            endsAt: existing.endsAt.toISOString(),
            status: existing.status,
          },
          after: {
            planId: row.planId,
            startsAt: row.startsAt.toISOString(),
            endsAt: row.endsAt.toISOString(),
            status: row.status,
          },
        },
        tx,
      });
      return row;
    });

    return toSubscriptionView(updated, new Date());
  }

  private assertValidRange(startsAt: Date, endsAt: Date) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Ngày không hợp lệ');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('Ngày hết hạn phải sau ngày bắt đầu');
    }
  }

  private async findOrThrow(subscriptionId: string) {
    const row = await this.prismaService.workspaceSubscription.findUnique({
      where: { id: subscriptionId },
      include: subscriptionInclude,
    });
    if (!row) throw new NotFoundException('Không tìm thấy subscription');
    return row;
  }
}
