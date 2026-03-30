import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMoneyAccountDto } from './dto/create-money-account.dto';
import { UpdateMoneyAccountDto } from './dto/update-money-account.dto';

@Injectable()
export class MoneyAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMoneyAccountDto, workspaceId: string) {
    // Check if account number already exists
    const existingAccount = await this.prisma.moneyAccount.findUnique({
      where: { accountNumber: dto.accountNumber },
    });

    if (existingAccount) {
      throw new BadRequestException('Account number already exists');
    }

    return this.prisma.moneyAccount.create({
      data: {
        accountNumber: dto.accountNumber,
        bankName: dto.bankName,
        bankCode: dto.bankCode,
        pay2sBankId: dto.pay2sBankId,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(workspaceId: string) {
    return this.prisma.moneyAccount.findMany({
      where: {
        isActive: true, // Only return active accounts
      },
      select: {
        id: true,
        accountNumber: true,
        bankName: true,
        bankCode: true,
        pay2sBankId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllIncludingInactive(workspaceId: string) {
    return this.prisma.moneyAccount.findMany({
      select: {
        id: true,
        accountNumber: true,
        bankName: true,
        bankCode: true,
        pay2sBankId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, workspaceId: string) {
    const account = await this.prisma.moneyAccount.findUnique({
      where: { id },
      select: {
        id: true,
        accountNumber: true,
        bankName: true,
        bankCode: true,
        pay2sBankId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Money account not found');
    }

    return account;
  }

  async update(id: string, dto: UpdateMoneyAccountDto, workspaceId: string) {
    const account = await this.prisma.moneyAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw new NotFoundException('Money account not found');
    }

    // Check if account number already exists (if updating account number)
    if (dto.accountNumber && dto.accountNumber !== account.accountNumber) {
      const existingAccount = await this.prisma.moneyAccount.findUnique({
        where: { accountNumber: dto.accountNumber },
      });

      if (existingAccount) {
        throw new BadRequestException('Account number already exists');
      }
    }

    return this.prisma.moneyAccount.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, workspaceId: string) {
    const account = await this.prisma.moneyAccount.findUnique({
      where: { id },
    });

    if (!account) {
      throw new NotFoundException('Money account not found');
    }

    // Soft delete by setting isActive to false
    return this.prisma.moneyAccount.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getActiveAccountsForTopup(workspaceId: string) {
    return this.prisma.moneyAccount.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        accountNumber: true,
        bankName: true,
        bankCode: true,
        pay2sBankId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
