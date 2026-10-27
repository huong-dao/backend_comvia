import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WalletTransactionType } from '@prisma/client';

type WalletLedgerParams = {
  ownerUserId: string;
  workspaceId: string;
  amount: Prisma.Decimal | number;
  type: WalletTransactionType;
  sourceType: string;
  sourceId: string;
  createdBy?: string | null;
  note?: string;
};

/**
 * The wallet row is locked before both its balance and the immutable ledger
 * entry are written. This keeps balanceBefore/balanceAfter true even when a
 * topup, a single send, and a campaign run concurrently for the same owner.
 */
@Injectable()
export class WalletLedgerService {
  async debit(
    tx: Prisma.TransactionClient,
    params: WalletLedgerParams,
  ): Promise<string> {
    const wallet = await this.lock(tx, params.ownerUserId);
    const amount = new Prisma.Decimal(params.amount);

    if (wallet.balance.lessThan(amount)) {
      throw new BadRequestException('Insufficient credit');
    }

    const balanceAfter = wallet.balance.minus(amount);
    const transaction = await tx.walletTransaction.create({
      data: {
        ...this.ledgerData(params, wallet.balance, balanceAfter),
      },
      select: { id: true },
    });

    await tx.walletAccount.update({
      where: { ownerUserId: params.ownerUserId },
      data: {
        balance: balanceAfter,
        totalSpent: { increment: amount },
      },
    });

    return transaction.id;
  }

  async credit(
    tx: Prisma.TransactionClient,
    params: WalletLedgerParams,
    counter: 'totalTopup' | 'totalRefund',
  ): Promise<string> {
    const wallet = await this.lock(tx, params.ownerUserId);
    const amount = new Prisma.Decimal(params.amount);
    const balanceAfter = wallet.balance.plus(amount);
    const transaction = await tx.walletTransaction.create({
      data: {
        ...this.ledgerData(params, wallet.balance, balanceAfter),
      },
      select: { id: true },
    });

    await tx.walletAccount.update({
      where: { ownerUserId: params.ownerUserId },
      data: {
        balance: balanceAfter,
        [counter]: { increment: amount },
      },
    });

    return transaction.id;
  }

  async lock(
    tx: Prisma.TransactionClient,
    ownerUserId: string,
  ): Promise<{ balance: Prisma.Decimal }> {
    const rows = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>(
      Prisma.sql`SELECT "balance" FROM "WalletAccount" WHERE "ownerUserId" = ${ownerUserId} FOR UPDATE`,
    );
    const wallet = rows[0];

    if (!wallet) {
      throw new BadRequestException('Wallet not initialized');
    }

    return wallet;
  }

  private ledgerData(
    params: WalletLedgerParams,
    balanceBefore: Prisma.Decimal,
    balanceAfter: Prisma.Decimal,
  ) {
    return {
      transactionCode: `WT_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ownerUserId: params.ownerUserId,
      workspaceId: params.workspaceId,
      type: params.type,
      amount: new Prisma.Decimal(params.amount),
      balanceBefore,
      balanceAfter,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      createdBy: params.createdBy,
      note: params.note,
    };
  }
}
