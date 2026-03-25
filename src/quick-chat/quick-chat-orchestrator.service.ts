import { Injectable } from '@nestjs/common';
import {
  OrchestratedResult,
  QuickChatIntent,
  QuickChatRole,
  QuickChatToolName,
} from './quick-chat.types';

type OrchestrateInput = {
  message: string;
  role: QuickChatRole;
  toolInput?: Record<string, unknown>;
};

@Injectable()
export class QuickChatOrchestratorService {
  orchestrate(input: OrchestrateInput): OrchestratedResult {
    const directTool = this.getString(input.toolInput?.toolName);
    if (directTool) {
      const requiresConfirmation =
        this.getBoolean(input.toolInput?.requiresConfirmation) ?? true;
      return {
        assistantMessage: `Da lap ke hoach chay tool ${directTool}.`,
        plan: {
          intent: 'UNKNOWN',
          toolName: directTool,
          requiresConfirmation,
          args: (input.toolInput?.args as Record<string, unknown>) ?? {},
        },
        executeNow: requiresConfirmation
          ? undefined
          : {
              toolName: directTool,
              args: (input.toolInput?.args as Record<string, unknown>) ?? {},
            },
      };
    }

    const intent = this.detectIntent(input.message);

    switch (intent) {
      case 'GET_WALLET_BALANCE':
        return {
          assistantMessage: 'Mình sẽ lấy số dư ví hiện tại của workspace này.',
          plan: {
            intent,
            toolName: 'wallet.getBalance',
            requiresConfirmation: false,
            args: {},
          },
          executeNow: { toolName: 'wallet.getBalance', args: {} },
        };

      case 'LIST_TEMPLATES':
        return {
          assistantMessage: 'Mình sẽ lấy danh sách template gần nhất.',
          plan: {
            intent,
            toolName: 'templates.list',
            requiresConfirmation: false,
            args: {},
          },
          executeNow: { toolName: 'templates.list', args: {} },
        };

      case 'LIST_MEMBERS':
        return {
          assistantMessage: 'Mình sẽ lấy danh sách thành viên workspace.',
          plan: {
            intent,
            toolName: 'members.list',
            requiresConfirmation: false,
            args: {},
          },
          executeNow: { toolName: 'members.list', args: {} },
        };

      case 'CREATE_TOPUP_QR': {
        if (input.role !== 'OWNER') {
          return {
            assistantMessage:
              'Tác vụ nạp tiền yêu cầu quyền OWNER của workspace.',
            plan: { intent, requiresConfirmation: true },
          };
        }

        const amountExclVat = this.getNumber(
          input.toolInput?.amountExclVat ?? this.extractFirstNumber(input.message),
        );
        if (!amountExclVat) {
          return {
            assistantMessage:
              'Bạn cho mình số tiền nạp (trước VAT), ví dụ: 1000000.',
            plan: {
              intent,
              toolName: 'topups.createQr',
              requiresConfirmation: true,
              missingFields: ['amountExclVat'],
            },
          };
        }

        return {
          assistantMessage: `Mình đã chuẩn bị tạo QR topup cho số tiền ${amountExclVat.toLocaleString('vi-VN')} (chưa VAT). Xác nhận để thực thi.`,
          plan: {
            intent,
            toolName: 'topups.createQr',
            requiresConfirmation: true,
            args: { amountExclVat },
          },
        };
      }

      case 'CREATE_TEMPLATE': {
        const args = {
          name: this.getString(input.toolInput?.name),
          content: this.getString(input.toolInput?.content),
          placeholdersJson: input.toolInput?.placeholdersJson as
            | Record<string, unknown>
            | undefined,
        };
        const missingFields = ['name', 'content', 'placeholdersJson'].filter(
          (k) => !args[k as keyof typeof args],
        );

        if (missingFields.length > 0) {
          return {
            assistantMessage:
              'Để tạo template, mình cần đủ: name, content, placeholdersJson. (Mã template sẽ được hệ thống tự sinh.)',
            plan: {
              intent,
              toolName: 'templates.create',
              requiresConfirmation: true,
              missingFields,
            },
          };
        }

        return {
          assistantMessage: `Mình đã chuẩn bị tạo template "${args.name}". Xác nhận để thực thi.`,
          plan: {
            intent,
            toolName: 'templates.create',
            requiresConfirmation: true,
            args,
          },
        };
      }

      case 'SEND_SINGLE_MESSAGE': {
        const args = {
          templateId: this.getString(input.toolInput?.templateId),
          phoneNumber: this.getString(input.toolInput?.phoneNumber),
          data: input.toolInput?.data as Record<string, unknown> | undefined,
        };
        const missingFields = ['templateId', 'phoneNumber', 'data'].filter(
          (k) => !args[k as keyof typeof args],
        );

        if (missingFields.length > 0) {
          return {
            assistantMessage:
              'Để gửi single message, mình cần: templateId, phoneNumber, data.',
            plan: {
              intent,
              toolName: 'messaging.sendSingle',
              requiresConfirmation: true,
              missingFields,
            },
          };
        }

        return {
          assistantMessage:
            'Mình đã chuẩn bị gửi tin single theo dữ liệu bạn cung cấp. Xác nhận để thực thi.',
          plan: {
            intent,
            toolName: 'messaging.sendSingle',
            requiresConfirmation: true,
            args,
          },
        };
      }

      default:
        return {
          assistantMessage:
            'Mình đã hiểu yêu cầu nhưng chưa map được hành động cụ thể. Hiện hỗ trợ: xem số dư, list template/member, tạo QR topup, tạo template, gửi single.',
          plan: { intent: 'UNKNOWN', requiresConfirmation: false },
        };
    }
  }

  private detectIntent(message: string): QuickChatIntent {
    const q = message.toLowerCase();
    if (q.includes('số dư') || q.includes('wallet') || q.includes('balance')) {
      return 'GET_WALLET_BALANCE';
    }
    if (q.includes('danh sách template') || q.includes('list template')) {
      return 'LIST_TEMPLATES';
    }
    if (q.includes('danh sách thành viên') || q.includes('list member')) {
      return 'LIST_MEMBERS';
    }
    if (q.includes('nạp') || q.includes('topup') || q.includes('qr')) {
      return 'CREATE_TOPUP_QR';
    }
    if (q.includes('tạo template') || q.includes('create template')) {
      return 'CREATE_TEMPLATE';
    }
    if (
      q.includes('gửi single') ||
      q.includes('send single') ||
      q.includes('gửi tin')
    ) {
      return 'SEND_SINGLE_MESSAGE';
    }
    return 'UNKNOWN';
  }

  private extractFirstNumber(text: string): number | null {
    const match = text.match(/\d[\d\.,]*/);
    if (!match) return null;
    const normalized = match[0].replace(/[.,]/g, '');
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  private getNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private getString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private getBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }
}
