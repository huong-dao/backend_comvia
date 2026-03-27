import { Injectable } from '@nestjs/common';
import { QuickChatRole } from './quick-chat.types';

type ToolOp = 'queryAll' | 'queryBy' | 'findBy' | 'create' | 'update';

type EntityConfig = {
  delegate: string;
  workspaceScoped: boolean;
  readRoles: QuickChatRole[];
  writeRoles: QuickChatRole[];
};

@Injectable()
export class QuickChatToolRegistryService {
  private readonly operations: ToolOp[] = [
    'queryAll',
    'queryBy',
    'findBy',
    'create',
    'update',
  ];

  // Covers all Prisma entities in schema.prisma
  private readonly entities: Record<string, EntityConfig> = {
    User: {
      delegate: 'user',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN'],
    },
    UserCredential: {
      delegate: 'userCredential',
      workspaceScoped: false,
      readRoles: ['ADMIN'],
      writeRoles: ['ADMIN'],
    },
    OtpRequest: {
      delegate: 'otpRequest',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN'],
    },
    Workspace: {
      delegate: 'workspace',
      workspaceScoped: false,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN'],
    },
    WorkspaceMember: {
      delegate: 'workspaceMember',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN', 'STAFF'],
    },
    WorkspaceBillingProfile: {
      delegate: 'workspaceBillingProfile',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN'],
    },
    WorkspaceInvitation: {
      delegate: 'workspaceInvitation',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN', 'STAFF'],
    },
    WalletAccount: {
      delegate: 'walletAccount',
      workspaceScoped: false,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN'],
    },
    WalletTransaction: {
      delegate: 'walletTransaction',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN'],
    },
    TopupRequest: {
      delegate: 'topupRequest',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN', 'STAFF'],
    },
    PaymentWebhookLog: {
      delegate: 'paymentWebhookLog',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    Order: {
      delegate: 'order',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    OrderItem: {
      delegate: 'orderItem',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    Invoice: {
      delegate: 'invoice',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    InvoiceItem: {
      delegate: 'invoiceItem',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    WorkspaceOaConnection: {
      delegate: 'workspaceOaConnection',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN', 'STAFF'],
    },
    Template: {
      delegate: 'template',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
    },
    TemplateSubmissionLog: {
      delegate: 'templateSubmissionLog',
      workspaceScoped: false,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    MessageLog: {
      delegate: 'messageLog',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
    },
    Campaign: {
      delegate: 'campaign',
      workspaceScoped: true,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
    },
    CampaignRow: {
      delegate: 'campaignRow',
      workspaceScoped: false,
      readRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'MEMBER', 'ADMIN', 'STAFF'],
    },
    ApiKey: {
      delegate: 'apiKey',
      workspaceScoped: true,
      readRoles: ['OWNER', 'ADMIN', 'STAFF'],
      writeRoles: ['OWNER', 'ADMIN'],
    },
    ApiRequestLog: {
      delegate: 'apiRequestLog',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    AuditLog: {
      delegate: 'auditLog',
      workspaceScoped: true,
      readRoles: ['OWNER', 'ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    NotificationLog: {
      delegate: 'notificationLog',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
    BackgroundJobLog: {
      delegate: 'backgroundJobLog',
      workspaceScoped: false,
      readRoles: ['ADMIN', 'STAFF'],
      writeRoles: ['ADMIN', 'STAFF'],
    },
  };

  listToolNames() {
    const tools: string[] = [];
    for (const [entity] of Object.entries(this.entities)) {
      for (const op of this.operations) {
        tools.push(`${entity}.${op}`);
      }
    }
    return tools;
  }

  resolve(toolName: string) {
    const [entity, op] = toolName.split('.');
    if (!entity || !op) return null;
    const config = this.entities[entity];
    if (!config) return null;
    if (!this.operations.includes(op as ToolOp)) return null;
    return { entity, op: op as ToolOp, config };
  }
}
