import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from '../audit-log/audit-log.constants';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { sha256Hex } from '../common/utils/sha256';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private generateApiKey(): { apiKey: string; prefix: string } {
    const raw = randomBytes(32).toString('base64url');
    const prefix = raw.slice(0, 8);
    return { apiKey: raw, prefix };
  }

  async create(workspaceId: string, dto: CreateApiKeyDto, actorUserId: string) {
    const { apiKey, prefix } = this.generateApiKey();
    const keyPrefix = dto.keyPrefixHint ?? prefix;
    const keyHash = sha256Hex(apiKey);

    const apiKeyRecord = await this.prismaService.apiKey.create({
      data: {
        workspaceId,
        name: dto.name,
        keyPrefix,
        keyHash,
        status: 'ACTIVE' satisfies ApiKeyStatus,
        createdBy: actorUserId,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    await this.auditLogService.write({
      actorUserId,
      workspaceId,
      action: AUDIT_ACTIONS.API_KEY_CREATED,
      resourceType: AUDIT_RESOURCE_TYPES.API_KEY,
      resourceId: apiKeyRecord.id,
      metadataJson: {
        name: apiKeyRecord.name,
        keyPrefix: apiKeyRecord.keyPrefix,
      },
    });

    // Only return full apiKey once (FE should store it securely)
    return { apiKey, ...apiKeyRecord };
  }

  // trả về danh sách api key với key dịch ngược từ keyhash
  async list(workspaceId: string) {
    return this.prismaService.apiKey.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async disable(workspaceId: string, apiKeyId: string, actorUserId: string) {
    const apiKey = await this.prismaService.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { id: true, workspaceId: true, name: true, keyPrefix: true },
    });
    if (!apiKey || apiKey.workspaceId !== workspaceId) {
      throw new BadRequestException('ApiKey not found');
    }

    const updated = await this.prismaService.apiKey.update({
      where: { id: apiKeyId },
      data: { status: 'DISABLED' satisfies ApiKeyStatus },
    });

    await this.auditLogService.write({
      actorUserId,
      workspaceId,
      action: AUDIT_ACTIONS.API_KEY_DISABLED,
      resourceType: AUDIT_RESOURCE_TYPES.API_KEY,
      resourceId: apiKeyId,
      metadataJson: {
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
      },
    });

    return updated;
  }

  async regenerate(workspaceId: string, apiKeyId: string, actorUserId: string) {
    const apiKey = await this.prismaService.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { id: true, workspaceId: true, name: true, keyPrefix: true },
    });
    if (!apiKey || apiKey.workspaceId !== workspaceId) {
      throw new BadRequestException('ApiKey not found');
    }

    const { apiKey: newKey, prefix } = this.generateApiKey();
    const keyHash = sha256Hex(newKey);

    await this.prismaService.apiKey.update({
      where: { id: apiKeyId },
      data: {
        keyHash,
        keyPrefix: prefix,
        status: 'ACTIVE' satisfies ApiKeyStatus,
        lastUsedAt: null,
      },
    });

    await this.auditLogService.write({
      actorUserId,
      workspaceId,
      action: AUDIT_ACTIONS.API_KEY_REGENERATED,
      resourceType: AUDIT_RESOURCE_TYPES.API_KEY,
      resourceId: apiKeyId,
      metadataJson: {
        name: apiKey.name,
        previousKeyPrefix: apiKey.keyPrefix,
        newKeyPrefix: prefix,
      },
    });

    return {
      apiKey: newKey,
    };
  }
}
