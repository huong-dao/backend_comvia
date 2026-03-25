import { Injectable } from '@nestjs/common';
import { WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private readonly prismaService: PrismaService) {}

  async getBalance(workspaceId: string) {
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerUserId: true },
    });
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    return this.prismaService.walletAccount.findUnique({
      where: { ownerUserId: workspace.ownerUserId },
      select: {
        ownerUserId: true,
        balance: true,
        totalTopup: true,
        totalSpent: true,
        totalRefund: true,
      },
    });
  }

  async listTransactions(workspaceId: string, type?: WalletTransactionType) {
    return this.prismaService.walletTransaction.findMany({
      where: {
        workspaceId,
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
