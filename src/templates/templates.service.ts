import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { Prisma, TemplateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ApproveTemplateDto } from './dto/approve-template.dto';
import { RejectTemplateDto } from './dto/reject-template.dto';
import { InternalTemplatesQueryDto } from './dto/internal-templates-query.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prismaService: PrismaService) {}

  private static readonly SIX_DIGIT_CODE_ATTEMPTS = 64;

  /** Uniform random in [100000, 999999] — always 6 digits, no leading-zero runs like 000001. */
  private randomSixDigitCode(): string {
    return randomInt(100_000, 1_000_000).toString();
  }

  private async getConnectedOaConnectionOrThrow(workspaceId: string) {
    const oaConnection =
      await this.prismaService.workspaceOaConnection.findUnique({
        where: { workspaceId },
        select: { id: true, status: true },
      });

    if (!oaConnection || oaConnection.status !== 'CONNECTED') {
      throw new BadRequestException('OA is not connected');
    }

    return oaConnection;
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
      providerTemplateId?: string | null;
      rejectedReason?: string | null;
    },
  ) {
    await this.getTemplateForInternalReviewOrThrow(templateId);

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

      return tx.template.update({
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
    });
  }

  async create(
    workspaceId: string,
    _actorUserId: string,
    dto: CreateTemplateDto,
  ) {
    const oa = await this.getConnectedOaConnectionOrThrow(workspaceId);

    for (let i = 0; i < TemplatesService.SIX_DIGIT_CODE_ATTEMPTS; i++) {
      const code = this.randomSixDigitCode();
      try {
        return await this.prismaService.template.create({
          data: {
            workspaceId,
            oaConnectionId: oa.id,
            name: dto.name,
            code,
            content: dto.content,
            placeholdersJson: dto.placeholdersJson as Prisma.InputJsonValue,
            status: 'DRAFT' satisfies TemplateStatus,
          },
          select: {
            id: true,
            name: true,
            code: true,
            content: true,
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
        name: true,
        code: true,
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

  async staffListTemplates(query: InternalTemplatesQueryDto) {
    return this.prismaService.template.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
        ...(query.oaId ? { oaConnectionId: query.oaId } : {}),
        ...(query.keyword
          ? {
              OR: [
                { name: { contains: query.keyword, mode: 'insensitive' } },
                { code: { contains: query.keyword, mode: 'insensitive' } },
                { workspace: { name: { contains: query.keyword, mode: 'insensitive' } } },
                { oaConnection: { oaName: { contains: query.keyword, mode: 'insensitive' } } },
                { oaConnection: { oaId: { contains: query.keyword, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit ?? 50,
      select: {
        id: true,
        name: true,
        code: true,
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
            oaId: true,
            oaName: true,
            status: true,
            connectedAt: true,
          },
        },
      },
    });
  }

  async staffGetTemplate(templateId: string) {
    const template = await this.prismaService.template.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        name: true,
        code: true,
        content: true,
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
            oaId: true,
            oaName: true,
            status: true,
            tokenExpiredAt: true,
            connectedAt: true,
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

    return template;
  }

  async update(
    workspaceId: string,
    templateId: string,
    _actorUserId: string,
    dto: UpdateTemplateDto,
  ) {
    const template = await this.prismaService.template.findFirst({
      where: { workspaceId, id: templateId },
      select: { id: true, status: true },
    });

    if (!template) {
      throw new BadRequestException('Template not found');
    }

    if (template.status === 'APPROVED') {
      throw new ForbiddenException('Approved template is read-only');
    }
    if (template.status === 'DISABLED') {
      throw new ForbiddenException('Template is disabled');
    }

    return this.prismaService.template.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        code: dto.code,
        content: dto.content,
        placeholdersJson: dto.placeholdersJson
          ? (dto.placeholdersJson as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async submit(workspaceId: string, templateId: string, actorUserId: string) {
    void actorUserId;

    const template = await this.prismaService.template.findFirst({
      where: { workspaceId, id: templateId },
      select: { id: true, status: true, oaConnectionId: true },
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

    await this.prismaService.templateSubmissionLog.create({
      data: {
        templateId,
        status: 'PENDING_ZALO_APPROVAL' satisfies TemplateStatus,
      },
    });

    return this.prismaService.template.update({
      where: { id: templateId },
      data: { status: 'PENDING_ZALO_APPROVAL' satisfies TemplateStatus },
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

  async staffApprove(templateId: string, dto: ApproveTemplateDto) {
    return this.updateTemplateInternalStatus(
      templateId,
      'APPROVED' satisfies TemplateStatus,
      {
        providerTemplateId: dto.providerTemplateId ?? null,
        rejectedReason: null,
      },
    );
  }

  async staffReject(templateId: string, dto: RejectTemplateDto) {
    return this.updateTemplateInternalStatus(
      templateId,
      'REJECTED' satisfies TemplateStatus,
      {
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
