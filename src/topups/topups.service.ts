import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TopupStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopupPay2sDto } from './dto/create-topup-pay2s.dto';
import {
  createPay2sCollectionLink,
  Pay2sBankAccount,
} from '../integrations/pay2s/pay2s.util';
import { CollectionRequestsService } from '../modules/collection-requests/collection-requests.service';
import { CollectionRequestType } from '../modules/collection-requests/dto/collection-request.dto';

@Injectable()
export class TopupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly collectionRequestsService: CollectionRequestsService,
  ) {}

  private generateCode(prefix: string) {
    return `${prefix}_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  async createTopupQr(
    workspaceId: string,
    userId: string,
    dto: { amountExclVat: number },
  ) {
    // Get the owner user for this workspace
    const workspace = await this.prismaService.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerUserId: true },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Get any active money account with Pay2S configured
    const moneyAccount = await this.prismaService.moneyAccount.findFirst({
      where: {
        isActive: true,
        pay2sBankId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!moneyAccount) {
      throw new BadRequestException('No active money account with Pay2S configured');
    }

    const createDto: CreateTopupPay2sDto = {
      amountExclVat: dto.amountExclVat,
      moneyAccountId: moneyAccount.id,
      vatRate: 10,
    };

    return this.createTopupWithPay2S(
      workspaceId,
      userId,
      createDto,
      moneyAccount.id,
    );
  }

  async createTopupWithPay2S(
    workspaceId: string,
    ownerUserId: string,
    dto: CreateTopupPay2sDto,
    moneyAccountId: string,
  ) {
    const vatRate = dto.vatRate ?? 10;
    const amountExcl = dto.amountExclVat;
    const amountIncl = amountExcl * (1 + vatRate / 100);
    const vatAmount = amountIncl - amountExcl;

    // Ensure wallet exists
    await this.prismaService.walletAccount.upsert({
      where: { ownerUserId },
      update: {},
      create: {
        ownerUserId,
        balance: 0,
        totalTopup: 0,
        totalSpent: 0,
        totalRefund: 0,
      },
    });

    // Create topup request first
    const topupQrContent = `pending_${Date.now()}_${randomBytes(8).toString('hex')}`;
    const topup = await this.prismaService.topupRequest.create({
      data: {
        topupCode: this.generateCode('TP'),
        ownerUserId,
        workspaceId,
        amountExclVat: amountExcl,
        vatAmount,
        amountInclVat: amountIncl,
        paymentProvider: 'pay2s',
        paymentRef: this.generateCode('PR'),
        qrContent: topupQrContent,
        qrExpiredAt: new Date(Date.now() + 15 * 60 * 1000),
        status: 'PENDING' satisfies TopupStatus,
      },
    });

    // Create collection request for Pay2S
    try {
      // Get money account details
      const moneyAccount = await this.prismaService.moneyAccount.findUnique({
        where: { id: moneyAccountId },
        select: {
          id: true,
          accountNumber: true,
          bankName: true,
          bankCode: true,
          pay2sBankId: true,
          isActive: true,
        },
      });

      if (!moneyAccount || !moneyAccount.isActive) {
        throw new BadRequestException('Invalid or inactive money account');
      }

      if (!moneyAccount.pay2sBankId) {
        throw new BadRequestException(
          'Money account does not have Pay2S bank ID configured',
        );
      }

      // Get Pay2S configuration
      const pay2sConfig = this.configService.get('pay2s');
      if (!pay2sConfig) {
        throw new BadRequestException('Pay2S configuration not found');
      }

      // Prepare bank account for Pay2S
      const bankAccounts: Pay2sBankAccount[] = [
        {
          account_number: moneyAccount.accountNumber,
          bank_id: moneyAccount.pay2sBankId,
        },
      ];

      // Create Pay2S collection link
      const pay2sResponse = await createPay2sCollectionLink({
        amount: Math.round(amountIncl), // Pay2S expects integer amount
        orderId: topup.id,
        orderInfo:
          `TOPUP${topup.topupCode.replace(/[^a-zA-Z0-9]/g, '')}`.substring(
            0,
            32,
          ), // Must be 10-32 chars, alphanumeric only
        bankAccounts,
        redirectUrl: `${process.env.FRONTEND_URL || 'https://localhost:3000'}/topup/success`,
        ipnUrl: `${process.env.BACKEND_URL || 'https://localhost:3001'}/api/v1/webhooks/pay2s`,
        requestType: 'pay2s',
        pay2sConfigData: {
          partner_code: pay2sConfig.partnerCode,
          partner_name: pay2sConfig.partnerName,
          api_key: pay2sConfig.apiKey,
          api_secret: pay2sConfig.apiSecret,
          api_url: pay2sConfig.apiUrl,
        },
      });

      console.log('Pay2S Response received:', JSON.stringify(pay2sResponse, null, 2));

      // Handle Pay2S response format - could be { status: false, message: ... } or { resultCode: ..., ... }
      const responseStatus = pay2sResponse?.status ?? pay2sResponse?.resultCode;
      
      if (!pay2sResponse) {
        console.error('Pay2S API returned null - check API endpoint and network');
        throw new BadRequestException(
          'Pay2S API error: No response from Pay2S service',
        );
      }

      // Check for error response (status: false or resultCode !== 0)
      if (responseStatus === false || (typeof responseStatus === 'number' && responseStatus !== 0)) {
        console.error('Pay2S API Error:', {
          response: pay2sResponse,
          status: pay2sResponse.status,
          resultCode: pay2sResponse.resultCode,
          message: pay2sResponse.message || pay2sResponse.resultMessage,
        });
        const errorMessage = pay2sResponse.message || pay2sResponse.resultMessage || 'Unknown error';
        throw new BadRequestException(
          `Pay2S API error: ${errorMessage}`,
        );
      }

      // Extract QR code from response
      const qrCode = pay2sResponse.qrList?.[0]?.qrCode;
      if (!qrCode) {
        throw new BadRequestException('No QR code received from Pay2S');
      }

      // Make QR content unique to avoid database constraint violation
      const uniqueQrContent = `${qrCode}_${Date.now()}`;

      // Update topup with QR code
      await this.prismaService.topupRequest.update({
        where: { id: topup.id },
        data: {
          qrContent: uniqueQrContent,
        },
      });

      // Create collection request for tracking
      try {
        console.log(moneyAccountId);
        await this.collectionRequestsService.create(ownerUserId, {
          type: CollectionRequestType.TOPUP,
          topupRequestId: topup.id,
          moneyAccountId: moneyAccountId,
          amount: Math.round(amountIncl),
        });
      } catch (collectionError) {
        console.error('Failed to create collection request:', collectionError);
        // Don't fail the topup creation if collection request fails
      }

      return {
        ...topup,
        qrContent: uniqueQrContent,
        collectionRequestCode: pay2sResponse.orderId,
        amountExclVat: amountExcl,
        vatAmount: vatAmount,
        amountInclVat: amountIncl,
      };
    } catch (error) {
      // If Pay2S integration fails, update topup status to FAILED
      console.error('Pay2S integration error details:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        topupId: topup.id,
      });

      try {
        await this.prismaService.topupRequest.update({
          where: { id: topup.id },
          data: {
            status: 'FAILED' satisfies TopupStatus,
          },
        });
      } catch (updateError) {
        console.error('Failed to update topup status to FAILED:', updateError);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        `Failed to create Pay2S collection request: ${errorMessage}`,
      );
    }
  }

  async getTopupStatus(workspaceId: string, topupCode: string) {
    const topup = await this.prismaService.topupRequest.findFirst({
      where: {
        topupCode,
        workspaceId,
      },
      select: {
        id: true,
        topupCode: true,
        status: true,
        paidAt: true,
        amountExclVat: true,
        vatAmount: true,
        amountInclVat: true,
        collectionRequest: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!topup) {
      throw new BadRequestException('Topup request not found');
    }

    return {
      id: topup.id,
      topupCode: topup.topupCode,
      status: topup.status,
      paidAt: topup.paidAt,
      amountExclVat: topup.amountExclVat,
      vatAmount: topup.vatAmount,
      amountInclVat: topup.amountInclVat,
      collectionRequestCode: topup.collectionRequest?.code,
    };
  }

  async getTopupHistory(workspaceId: string, query: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const status = query.status;

    const where: any = {
      workspaceId,
    };

    if (status) {
      where.status = status;
    }

    const [topups, total] = await Promise.all([
      this.prismaService.topupRequest.findMany({
        where,
        select: {
          id: true,
          topupCode: true,
          status: true,
          paidAt: true,
          amountExclVat: true,
          vatAmount: true,
          amountInclVat: true,
          createdAt: true,
          collectionRequest: {
            select: {
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prismaService.topupRequest.count({ where }),
    ]);

    return {
      data: topups.map((topup) => ({
        id: topup.id,
        topupCode: topup.topupCode,
        amountExclVat: topup.amountExclVat,
        amountInclVat: topup.amountInclVat,
        status: topup.status,
        paidAt: topup.paidAt,
        createdAt: topup.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
