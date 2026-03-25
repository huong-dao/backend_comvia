import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { MembersService } from '../members/members.service';
import { MessagingService } from '../messaging/messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { TopupsService } from '../topups/topups.service';
import { WalletService } from '../wallet/wallet.service';
import { QuickChatRole, QuickChatToolName } from './quick-chat.types';
import { QuickChatToolRegistryService } from './quick-chat-tool-registry.service';

type ExecuteInput = {
  toolName: QuickChatToolName;
  workspaceId?: string;
  userId: string;
  role: QuickChatRole;
  args: Record<string, unknown>;
};

@Injectable()
export class QuickChatToolExecutorService {
  constructor(
    private readonly walletService: WalletService,
    private readonly templatesService: TemplatesService,
    private readonly membersService: MembersService,
    private readonly topupsService: TopupsService,
    private readonly messagingService: MessagingService,
    private readonly prismaService: PrismaService,
    private readonly toolRegistry: QuickChatToolRegistryService,
  ) {}

  async execute(input: ExecuteInput) {
    switch (input.toolName) {
      case 'wallet.getBalance':
        if (!input.workspaceId) throw new BadRequestException('workspaceId is required');
        return this.walletService.getBalance(input.workspaceId);

      case 'templates.list':
        if (!input.workspaceId) throw new BadRequestException('workspaceId is required');
        return this.templatesService.list(input.workspaceId);

      case 'members.list':
        if (!input.workspaceId) throw new BadRequestException('workspaceId is required');
        return this.membersService.listMembers(input.workspaceId);

      case 'topups.createQr':
        if (!input.workspaceId) throw new BadRequestException('workspaceId is required');
        return this.topupsService.createTopupQr(input.workspaceId, input.userId, {
          amountExclVat: Number(input.args.amountExclVat),
        });

      case 'templates.create':
        if (!input.workspaceId) throw new BadRequestException('workspaceId is required');
        return this.templatesService.create(input.workspaceId, input.userId, {
          name: String(input.args.name ?? ''),
          content: String(input.args.content ?? ''),
          placeholdersJson:
            (input.args.placeholdersJson as Record<string, unknown>) ?? {},
        });

      case 'messaging.sendSingle':
        if (!input.workspaceId) throw new BadRequestException('workspaceId is required');
        return this.messagingService.sendSingle(input.workspaceId, input.userId, {
          templateId: String(input.args.templateId ?? ''),
          phoneNumber: String(input.args.phoneNumber ?? ''),
          data: (input.args.data as Record<string, unknown>) ?? {},
        });

      default:
        return this.executeGenericEntityTool(input);
    }
  }

  private async executeGenericEntityTool(input: ExecuteInput) {
    const resolved = this.toolRegistry.resolve(input.toolName);
    if (!resolved) {
      throw new BadRequestException(`Unknown tool: ${input.toolName}`);
    }

    const { config, op } = resolved;
    const isWrite = op === 'create' || op === 'update';
    const allowedRoles = isWrite ? config.writeRoles : config.readRoles;
    if (!allowedRoles.includes(input.role)) {
      throw new ForbiddenException(
        `Role ${input.role} is not allowed to run ${input.toolName}`,
      );
    }

    const delegate = (this.prismaService as Record<string, any>)[config.delegate];
    if (!delegate) {
      throw new BadRequestException(`Entity delegate not found: ${config.delegate}`);
    }

    const whereFromArgs = (input.args.where as Record<string, unknown> | undefined) ?? {};
    const dataFromArgs = (input.args.data as Record<string, unknown> | undefined) ?? {};
    const take =
      typeof input.args.take === 'number' ? Math.min(Math.max(input.args.take, 1), 200) : 50;
    const orderBy = (input.args.orderBy as Record<string, 'asc' | 'desc'> | undefined) ?? {
      createdAt: 'desc',
    };

    const where = { ...whereFromArgs };
    let data = { ...dataFromArgs };

    if (config.workspaceScoped) {
      const scopedWorkspaceId =
        input.workspaceId ?? (input.args.workspaceId as string | undefined);
      if (!scopedWorkspaceId) {
        throw new BadRequestException(
          `workspaceId is required for workspace scoped entity ${resolved.entity}`,
        );
      }
      (where as Record<string, unknown>).workspaceId = scopedWorkspaceId;
      data = { workspaceId: scopedWorkspaceId, ...data };
    }

    switch (op) {
      case 'queryAll':
        return delegate.findMany({ where, take, orderBy });
      case 'queryBy':
        return delegate.findMany({ where, take, orderBy });
      case 'findBy':
        return delegate.findFirst({ where, orderBy });
      case 'create':
        return delegate.create({ data });
      case 'update':
        return delegate.updateMany({ where, data });
      default:
        throw new BadRequestException(`Unsupported operation ${op}`);
    }
  }
}
