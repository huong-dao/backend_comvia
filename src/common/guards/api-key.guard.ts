import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { sha256Hex } from '../utils/sha256';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prismaService: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    type ApiKeyRequest = {
      headers?: Record<string, unknown>;
      body?: unknown;
      query?: Record<string, unknown>;
      apiKey?: {
        id: string;
        workspaceId: string;
        status: string;
        keyHash: string;
      };
      workspaceId?: string;
    };

    const req = context.switchToHttp().getRequest<ApiKeyRequest>();

    const headerValue = req.headers?.['x-api-key'];
    const apiKeyFromHeader =
      typeof headerValue === 'string' ? headerValue : undefined;

    const bodyObj =
      req.body && typeof req.body === 'object'
        ? (req.body as Record<string, unknown>)
        : undefined;
    const apiKeyFromBody =
      bodyObj && typeof bodyObj['api_key'] === 'string'
        ? bodyObj['api_key']
        : undefined;

    const queryObj = req.query;
    const apiKeyFromQuery =
      queryObj && typeof queryObj['api_key'] === 'string'
        ? queryObj['api_key']
        : undefined;

    const apiKey = apiKeyFromHeader ?? apiKeyFromBody ?? apiKeyFromQuery;
    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing api_key');
    }

    const keyHash = sha256Hex(apiKey);

    const apiKeyRecord = await this.prismaService.apiKey.findUnique({
      where: { keyHash },
      select: { id: true, workspaceId: true, status: true, keyHash: true },
    });

    if (!apiKeyRecord || apiKeyRecord.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid api_key');
    }

    // Attach workspace context for public controllers
    req.apiKey = apiKeyRecord;
    req.workspaceId = apiKeyRecord.workspaceId;

    await this.prismaService.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    return true;
  }
}
