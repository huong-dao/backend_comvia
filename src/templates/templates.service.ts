import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import {
  OaConnectionStatus,
  Prisma,
  TemplateStatus,
  TemplateType,
  UserRole,
} from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ApproveTemplateDto } from './dto/approve-template.dto';
import { RejectTemplateDto } from './dto/reject-template.dto';
import { InternalTemplatesQueryDto } from './dto/internal-templates-query.dto';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private static readonly SIX_DIGIT_CODE_ATTEMPTS = 64;

  /** Uniform random in [100000, 999999] — always 6 digits, no leading-zero runs like 000001. */
  private randomSixDigitCode(): string {
    return randomInt(100_000, 1_000_000).toString();
  }

  private async getConnectedOaConnectionOrThrow(workspaceId: string) {
    // Template.oaConnectionId references WorkspaceOa.id (ADR-001); gate template
    // creation on the Zalo connection status reached via the OA profile.
    const workspaceOa = await this.prismaService.workspaceOa.findUnique({
      where: { workspaceId },
      select: { id: true, connection: { select: { status: true } } },
    });

    if (!workspaceOa || workspaceOa.connection?.status !== 'CONNECTED') {
      throw new BadRequestException('OA is not connected');
    }

    return { id: workspaceOa.id };
  }

  /**
   * Enforce BR-TPL-01 content-structure rules per template type:
   * - TEXT / TABLE: `content` (>=1 char) and `placeholdersJson` are required.
   * - OTP: `content`/`placeholdersJson` are ignored; `otpExpiryMinutes` is required.
   */
  private validateTemplateByTypeOrThrow(input: {
    type: TemplateType;
    content?: string | null;
    placeholdersJson?: Record<string, unknown> | null;
    otpExpiryMinutes?: number | null;
  }): void {
    if (input.type === TemplateType.OTP) {
      if (input.otpExpiryMinutes == null) {
        throw new BadRequestException(
          'otpExpiryMinutes is required for OTP templates',
        );
      }
      return;
    }

    // TEXT and TABLE share the free-text content requirement.
    if (input.content == null || input.content.length < 1) {
      throw new BadRequestException(
        'content is required for TEXT/TABLE templates',
      );
    }
    if (input.placeholdersJson == null) {
      throw new BadRequestException(
        'placeholdersJson is required for TEXT/TABLE templates',
      );
    }
  }

  private canEditTemplateCode(role: UserRole): boolean {
    return role === UserRole.ADMIN || role === UserRole.STAFF;
  }

  private async getTemplateForInternalReviewOrThrow(templateId: string) {
    const template = await this.prismaService.template.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        workspaceId: true,
        oaConnectionId: true,
        status: true,
      },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    return template;
  }

  private async updateTemplateInternalStatus(
    templateId: string,
    status: TemplateStatus,
    options?: {
      actorUserId?: string;
      providerTemplateId?: string | null;
      rejectedReason?: string | null;
    },
  ) {
    const template = await this.getTemplateForInternalReviewOrThrow(templateId);

    return this.prismaService.$transaction(async (tx) => {
      await tx.templateSubmissionLog.create({
        data: {
          templateId,
          status,
          providerResponse:
            options?.providerTemplateId != null
              ? ({
                  providerTemplateId: options.providerTemplateId,
                } as Prisma.InputJsonValue)
              : undefined,
          reason: options?.rejectedReason ?? undefined,
        },
      });

      const updated = await tx.template.update({
        where: { id: templateId },
        data: {
          status,
          providerTemplateId:
            options?.providerTemplateId !== undefined
              ? options.providerTemplateId
              : undefined,
          rejectedReason:
            options?.rejectedReason !== undefined
              ? options.rejectedReason
              : undefined,
        },
        select: {
          id: true,
          status: true,
          providerTemplateId: true,
          rejectedReason: true,
          updatedAt: true,
        },
      });

      if (status === 'APPROVED' && options?.actorUserId) {
        await this.auditLogService.write({
          actorUserId: options.actorUserId,
          workspaceId: template.workspaceId,
          action: AUDIT_ACTIONS.TEMPLATE_APPROVED,
          resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
          resourceId: templateId,
          metadataJson: {
            providerTemplateId: updated.providerTemplateId,
          },
          tx,
        });
      }

      if (status === 'REJECTED' && options?.actorUserId) {
        await this.auditLogService.write({
          actorUserId: options.actorUserId,
          workspaceId: template.workspaceId,
          action: AUDIT_ACTIONS.TEMPLATE_REJECTED,
          resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
          resourceId: templateId,
          metadataJson: {
            reason: options.rejectedReason,
          },
          tx,
        });
      }

      return updated;
    });
  }

  async create(
    workspaceId: string,
    _actorUserId: string,
    dto: CreateTemplateDto,
  ) {
    const oa = await this.getConnectedOaConnectionOrThrow(workspaceId);

    const type = dto.type ?? TemplateType.TEXT;
    this.validateTemplateByTypeOrThrow({
      type,
      content: dto.content,
      placeholdersJson: dto.placeholdersJson,
      otpExpiryMinutes: dto.otpExpiryMinutes,
    });

    const isOtp = type === TemplateType.OTP;

    for (let i = 0; i < TemplatesService.SIX_DIGIT_CODE_ATTEMPTS; i++) {
      const code = this.randomSixDigitCode();
      try {
        return await this.prismaService.template.create({
          data: {
            workspaceId,
            oaConnectionId: oa.id,
            type,
            name: dto.name,
            code,
            title: dto.title ?? null,
            trackingId: dto.trackingId ?? null,
            // OTP templates omit free-text content/placeholders.
            content: isOtp ? null : dto.content,
            placeholdersJson: isOtp
              ? Prisma.DbNull
              : (dto.placeholdersJson as Prisma.InputJsonValue),
            // secondaryContent only applies to TABLE templates.
            secondaryContent:
              type === TemplateType.TABLE
                ? (dto.secondaryContent ?? null)
                : null,
            otpExpiryMinutes: isOtp ? dto.otpExpiryMinutes : null,
            status: 'DRAFT' satisfies TemplateStatus,
          },
          select: {
            id: true,
            type: true,
            name: true,
            code: true,
            title: true,
            trackingId: true,
            content: true,
            secondaryContent: true,
            otpExpiryMinutes: true,
            placeholdersJson: true,
            status: true,
            rejectedReason: true,
            oaConnectionId: true,
            createdAt: true,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          continue;
        }
        throw e;
      }
    }

    throw new BadRequestException(
      'Could not allocate a unique template code for this workspace',
    );
  }

  async list(workspaceId: string) {
    return this.prismaService.template.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        name: true,
        code: true,
        title: true,
        trackingId: true,
        secondaryContent: true,
        otpExpiryMinutes: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async get(workspaceId: string, templateId: string) {
    const template = await this.prismaService.template.findFirst({
      where: { workspaceId, id: templateId },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    return template;
  }

  /** Flatten WorkspaceOa + its Zalo connection into the legacy oaConnection shape. */
  private flattenOaConnection(oaProfile: {
    id: string;
    connection: {
      oaId: string;
      oaName: string | null;
      status: OaConnectionStatus;
      connectedAt: Date | null;
      tokenExpiredAt?: Date | null;
    } | null;
  }) {
    const connection = oaProfile.connection;
    return {
      id: oaProfile.id,
      oaId: connection?.oaId ?? null,
      oaName: connection?.oaName ?? null,
      status:
        connection?.status ?? ('NOT_CONNECTED' satisfies OaConnectionStatus),
      connectedAt: connection?.connectedAt ?? null,
      ...(connection && 'tokenExpiredAt' in connection
        ? { tokenExpiredAt: connection.tokenExpiredAt ?? null }
        : {}),
    };
  }

  async staffListTemplates(query: InternalTemplatesQueryDto) {
    const templates = await this.prismaService.template.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
        ...(query.oaId ? { oaConnectionId: query.oaId } : {}),
        ...(query.keyword
          ? {
              OR: [
                { name: { contains: query.keyword, mode: 'insensitive' } },
                { code: { contains: query.keyword, mode: 'insensitive' } },
                {
                  workspace: {
                    name: { contains: query.keyword, mode: 'insensitive' },
                  },
                },
                {
                  oaConnection: {
                    connection: {
                      oaName: {
                        contains: query.keyword,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
                {
                  oaConnection: {
                    connection: {
                      oaId: { contains: query.keyword, mode: 'insensitive' },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit ?? 50,
      select: {
        id: true,
        type: true,
        name: true,
        code: true,
        title: true,
        trackingId: true,
        secondaryContent: true,
        otpExpiryMinutes: true,
        status: true,
        providerTemplateId: true,
        rejectedReason: true,
        createdAt: true,
        updatedAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        oaConnection: {
          select: {
            id: true,
            connection: {
              select: {
                oaId: true,
                oaName: true,
                status: true,
                connectedAt: true,
              },
            },
          },
        },
      },
    });

    return templates.map((template) => ({
      ...template,
      oaConnection: this.flattenOaConnection(template.oaConnection),
    }));
  }

  async staffGetTemplate(templateId: string) {
    const template = await this.prismaService.template.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        type: true,
        name: true,
        code: true,
        title: true,
        trackingId: true,
        content: true,
        secondaryContent: true,
        otpExpiryMinutes: true,
        placeholdersJson: true,
        providerTemplateId: true,
        status: true,
        rejectedReason: true,
        createdAt: true,
        updatedAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        oaConnection: {
          select: {
            id: true,
            connection: {
              select: {
                oaId: true,
                oaName: true,
                status: true,
                tokenExpiredAt: true,
                connectedAt: true,
              },
            },
          },
        },
        submissions: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            providerResponse: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    return {
      ...template,
      oaConnection: this.flattenOaConnection(template.oaConnection),
    };
  }

  private isAdminOnlyTemplatePriceUpdate(dto: UpdateTemplateDto): boolean {
    return (
      dto.unitPricePerMessage !== undefined &&
      dto.name === undefined &&
      dto.code === undefined &&
      dto.content === undefined &&
      dto.placeholdersJson === undefined &&
      dto.type === undefined &&
      dto.title === undefined &&
      dto.trackingId === undefined &&
      dto.secondaryContent === undefined &&
      dto.otpExpiryMinutes === undefined
    );
  }

  async update(
    workspaceId: string,
    templateId: string,
    _actorUserId: string,
    actorRole: UserRole,
    dto: UpdateTemplateDto,
  ) {
    const template = await this.prismaService.template.findFirst({
      where: { workspaceId, id: templateId },
      select: {
        id: true,
        status: true,
        type: true,
        content: true,
        placeholdersJson: true,
        otpExpiryMinutes: true,
      },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    if (template.status === 'DISABLED') {
      throw new ForbiddenException('Template is disabled');
    }

    const adminPriceOnly =
      template.status === 'APPROVED' &&
      this.isAdminOnlyTemplatePriceUpdate(dto);

    if (template.status === 'APPROVED' && !adminPriceOnly) {
      throw new ForbiddenException('Approved template is read-only');
    }

    if (dto.code !== undefined && !this.canEditTemplateCode(actorRole)) {
      throw new ForbiddenException(
        'Only platform admin or staff can change template code',
      );
    }

    if (dto.unitPricePerMessage !== undefined && actorRole !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only platform admin can set template unit price per message',
      );
    }

    // Validate the merged (existing + patch) template against its type rules,
    // unless this is the admin price-only branch (nothing structural changes).
    if (!adminPriceOnly) {
      this.validateTemplateByTypeOrThrow({
        type: dto.type ?? template.type,
        content: dto.content !== undefined ? dto.content : template.content,
        placeholdersJson:
          dto.placeholdersJson !== undefined
            ? dto.placeholdersJson
            : (template.placeholdersJson as Record<string, unknown> | null),
        otpExpiryMinutes:
          dto.otpExpiryMinutes !== undefined
            ? dto.otpExpiryMinutes
            : template.otpExpiryMinutes,
      });
    }

    return this.prismaService.template.update({
      where: { id: templateId },
      data: {
        name: adminPriceOnly ? undefined : dto.name,
        code: this.canEditTemplateCode(actorRole) ? dto.code : undefined,
        type: adminPriceOnly ? undefined : dto.type,
        title: adminPriceOnly ? undefined : dto.title,
        trackingId: adminPriceOnly ? undefined : dto.trackingId,
        content: adminPriceOnly ? undefined : dto.content,
        secondaryContent: adminPriceOnly ? undefined : dto.secondaryContent,
        otpExpiryMinutes: adminPriceOnly ? undefined : dto.otpExpiryMinutes,
        placeholdersJson:
          adminPriceOnly || !dto.placeholdersJson
            ? undefined
            : (dto.placeholdersJson as Prisma.InputJsonValue),
        unitPricePerMessage:
          dto.unitPricePerMessage !== undefined
            ? new Prisma.Decimal(dto.unitPricePerMessage)
            : undefined,
      },
    });
  }

  async submit(workspaceId: string, templateId: string, actorUserId: string) {
    const template = await this.prismaService.template.findFirst({
      where: { workspaceId, id: templateId },
      select: {
        id: true,
        status: true,
        oaConnectionId: true,
        name: true,
        code: true,
      },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }
    if (template.status === 'DISABLED') {
      throw new ForbiddenException('Template is disabled');
    }
    if (template.status === 'APPROVED') {
      throw new ForbiddenException('Template already approved');
    }

    return this.prismaService.$transaction(async (tx) => {
      await tx.templateSubmissionLog.create({
        data: {
          templateId,
          status: 'PENDING_ZALO_APPROVAL' satisfies TemplateStatus,
        },
      });

      const updated = await tx.template.update({
        where: { id: templateId },
        data: { status: 'PENDING_ZALO_APPROVAL' satisfies TemplateStatus },
      });

      await this.auditLogService.write({
        actorUserId,
        workspaceId,
        action: AUDIT_ACTIONS.TEMPLATE_SUBMITTED,
        resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
        resourceId: templateId,
        metadataJson: {
          name: template.name,
          code: template.code,
        },
        tx,
      });

      return updated;
    });
  }

  async disable(workspaceId: string, templateId: string, actorUserId: string) {
    void actorUserId;

    const template = await this.prismaService.template.findFirst({
      where: { workspaceId, id: templateId },
      select: { id: true },
    });
    if (!template) {
      throw new BadRequestException('Template not found');
    }

    return this.prismaService.template.update({
      where: { id: templateId },
      data: { status: 'DISABLED' satisfies TemplateStatus },
    });
  }

  async staffApprove(
    templateId: string,
    actorUserId: string,
    dto: ApproveTemplateDto,
  ) {
    return this.updateTemplateInternalStatus(
      templateId,
      'APPROVED' satisfies TemplateStatus,
      {
        actorUserId,
        providerTemplateId: dto.providerTemplateId ?? null,
        rejectedReason: null,
      },
    );
  }

  async staffReject(
    templateId: string,
    actorUserId: string,
    dto: RejectTemplateDto,
  ) {
    return this.updateTemplateInternalStatus(
      templateId,
      'REJECTED' satisfies TemplateStatus,
      {
        actorUserId,
        rejectedReason: dto.reason,
      },
    );
  }

  async staffMarkPendingZaloApproval(templateId: string) {
    return this.updateTemplateInternalStatus(
      templateId,
      'PENDING_ZALO_APPROVAL' satisfies TemplateStatus,
    );
  }

  async staffDisable(templateId: string) {
    return this.updateTemplateInternalStatus(
      templateId,
      'DISABLED' satisfies TemplateStatus,
    );
  }
}
