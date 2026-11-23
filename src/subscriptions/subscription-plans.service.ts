import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionPlan } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { ListSubscriptionPlansQueryDto } from './dto/list-subscription-plans-query.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { calculateSubscriptionAmounts } from './subscription-pricing';

export function toPlanView(plan: SubscriptionPlan) {
  const amounts = calculateSubscriptionAmounts(
    plan.priceExclVat,
    plan.vatPercent,
  );
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    durationYears: plan.durationYears,
    priceExclVat: amounts.amountExclVat,
    vatPercent: amounts.vatPercent,
    vatAmount: amounts.vatAmount,
    // Tổng khách phải thanh toán = giá + VAT, hệ thống tự tính.
    totalAmountInclVat: amounts.amountInclVat,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

@Injectable()
export class SubscriptionPlansService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private slug(name: string) {
    const base = name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toUpperCase()
      .slice(0, 30);
    return `${base || 'PLAN'}-${randomBytes(2).toString('hex').toUpperCase()}`;
  }

  async create(adminUserId: string, dto: CreateSubscriptionPlanDto) {
    const code = dto.code?.toUpperCase() ?? this.slug(dto.name);
    try {
      const plan = await this.prismaService.subscriptionPlan.create({
        data: {
          code,
          name: dto.name,
          description: dto.description ?? null,
          priceExclVat: new Prisma.Decimal(dto.priceExclVat),
          vatPercent: new Prisma.Decimal(dto.vatPercent),
          durationYears: dto.durationYears,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.auditLogService.write({
        actorUserId: adminUserId,
        action: AUDIT_ACTIONS.SUBSCRIPTION_PLAN_CREATED,
        resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION_PLAN,
        resourceId: plan.id,
        metadataJson: { ...dto },
      });
      return toPlanView(plan);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Mã gói "${code}" đã tồn tại`);
      }
      throw error;
    }
  }

  async update(
    adminUserId: string,
    planId: string,
    dto: UpdateSubscriptionPlanDto,
  ) {
    await this.findOrThrow(planId);
    const plan = await this.prismaService.subscriptionPlan.update({
      where: { id: planId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.priceExclVat !== undefined
          ? { priceExclVat: new Prisma.Decimal(dto.priceExclVat) }
          : {}),
        ...(dto.vatPercent !== undefined
          ? { vatPercent: new Prisma.Decimal(dto.vatPercent) }
          : {}),
        ...(dto.durationYears !== undefined
          ? { durationYears: dto.durationYears }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    await this.auditLogService.write({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.SUBSCRIPTION_PLAN_UPDATED,
      resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION_PLAN,
      resourceId: plan.id,
      metadataJson: { ...dto },
    });
    return toPlanView(plan);
  }

  async get(planId: string) {
    return toPlanView(await this.findOrThrow(planId));
  }

  /** Admin: mọi gói. Workspace: chỉ gói đang bán (`onlyActive`). */
  async list(query: ListSubscriptionPlansQueryDto, onlyActive: boolean) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SubscriptionPlanWhereInput = {
      ...(onlyActive
        ? { isActive: true }
        : query.isActive !== undefined
          ? { isActive: query.isActive }
          : {}),
      ...(query.durationYears !== undefined
        ? { durationYears: query.durationYears }
        : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { code: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prismaService.subscriptionPlan.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prismaService.subscriptionPlan.count({ where }),
    ]);

    return {
      data: rows.map(toPlanView),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async findOrThrow(planId: string) {
    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    if (!plan) throw new NotFoundException('Không tìm thấy gói subscription');
    return plan;
  }
}
