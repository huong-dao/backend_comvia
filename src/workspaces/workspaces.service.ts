import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BillingType,
  MemberRole,
  Prisma,
  WorkspaceStatus,
} from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceBillingFieldsDto } from './dto/workspace-billing-fields.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private validateBillingOrThrow(billing: WorkspaceBillingFieldsDto) {
    if (billing.billingType === BillingType.ORGANIZATION) {
      if (
        !billing.companyName ||
        !billing.taxCode ||
        !billing.address ||
        !billing.invoiceEmail
      ) {
        throw new BadRequestException(
          'Organization billing requires companyName, taxCode, address, and invoiceEmail',
        );
      }
      return;
    }

    if (billing.billingType === BillingType.INDIVIDUAL) {
      if (
        !billing.fullName ||
        !billing.citizenId ||
        !billing.taxCode ||
        !billing.address ||
        !billing.invoiceEmail ||
        !billing.phone
      ) {
        throw new BadRequestException(
          'Individual billing requires fullName, citizenId, taxCode, address, invoiceEmail, and phone',
        );
      }
      return;
    }

    throw new BadRequestException('Unsupported billing type');
  }

  private mapBillingCreateInput(
    billing: WorkspaceBillingFieldsDto,
  ): Prisma.WorkspaceBillingProfileUncheckedCreateWithoutWorkspaceInput {
    return {
      billingType: billing.billingType,
      companyName: billing.companyName,
      taxCode: billing.taxCode,
      address: billing.address,
      invoiceEmail: billing.invoiceEmail,
      representativeName: billing.representativeName,
      phone: billing.phone,
      fullName: billing.fullName,
      citizenId: billing.citizenId,
    };
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    if (!dto.slug) {
      dto.slug = undefined;
    }
    this.validateBillingOrThrow(dto.billing);

    const workspace = await this.prismaService.workspace.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        ownerUserId: userId,
        status: 'ACTIVE' satisfies WorkspaceStatus,
        billingProfile: {
          create: this.mapBillingCreateInput(dto.billing),
        },
        members: {
          create: {
            userId,
            role: 'OWNER' satisfies MemberRole,
            status: 'ACTIVE',
          },
        },
      },
      include: {
        billingProfile: true,
        members: {
          select: { id: true, userId: true, role: true, status: true },
        },
      },
    });

    await this.auditLogService.write({
      actorUserId: userId,
      workspaceId: workspace.id,
      action: AUDIT_ACTIONS.WORKSPACE_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE,
      resourceId: workspace.id,
      metadataJson: {
        name: workspace.name,
        slug: workspace.slug,
        billingType: workspace.billingProfile?.billingType,
      },
    });

    return workspace;
  }

  async listForUser(userId: string) {
    const memberships = await this.prismaService.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      status: m.workspace.status,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  async switchWorkspace(userId: string, workspaceId: string) {
    const membership = await this.prismaService.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });

    if (!membership) {
      throw new BadRequestException('You are not a member of this workspace');
    }

    return this.prismaService.user.update({
      where: { id: userId },
      data: { lastActiveWorkspaceId: workspaceId },
      select: { id: true, lastActiveWorkspaceId: true },
    });
  }

  async updateOwner(
    userId: string,
    workspaceId: string,
    dto: UpdateWorkspaceDto,
  ) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerUserId: true },
    });

    if (!workspace) {
      throw new BadRequestException('Workspace not found');
    }
    if (workspace.ownerUserId !== userId) {
      throw new BadRequestException('Only workspace owner can update');
    }

    if (dto.billing) {
      this.validateBillingOrThrow(dto.billing);
    }

    const updated = await this.prismaService.workspace.update({
      where: { id: workspaceId },
      data: {
        name: dto.name,
        slug: dto.slug,
        billingProfile: dto.billing
          ? {
              upsert: {
                update: this.mapBillingCreateInput(dto.billing),
                create: this.mapBillingCreateInput(dto.billing),
              },
            }
          : undefined,
      },
      include: {
        billingProfile: true,
      },
    });

    if (dto.name !== undefined || dto.slug !== undefined) {
      await this.auditLogService.write({
        actorUserId: userId,
        workspaceId,
        action: AUDIT_ACTIONS.WORKSPACE_UPDATED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE,
        resourceId: workspaceId,
        metadataJson: {
          name: updated.name,
          slug: updated.slug,
        },
      });
    }

    if (dto.billing) {
      await this.auditLogService.write({
        actorUserId: userId,
        workspaceId,
        action: AUDIT_ACTIONS.BILLING_INFO_UPDATED,
        resourceType: AUDIT_RESOURCE_TYPES.WORKSPACE_BILLING_PROFILE,
        resourceId: updated.billingProfile?.id ?? workspaceId,
        metadataJson: {
          billingType: updated.billingProfile?.billingType,
        },
      });
    }

    return updated;
  }

  async softDelete(userId: string, workspaceId: string) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerUserId: true },
    });

    if (!workspace) {
      throw new BadRequestException('Workspace not found');
    }
    if (workspace.ownerUserId !== userId) {
      throw new BadRequestException('Only workspace owner can delete');
    }

    return this.prismaService.workspace.update({
      where: { id: workspaceId },
      data: { status: 'DELETED' satisfies WorkspaceStatus },
    });
  }
}
