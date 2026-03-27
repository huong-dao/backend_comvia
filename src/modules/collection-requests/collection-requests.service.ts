import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import {
  createPay2sCollectionLink,
  Pay2sBankAccount,
  Pay2sConfigData,
} from '../../integrations/pay2s/pay2s.util';
import {
  CreateCollectionRequestDto,
  CollectionRequestType,
  CollectionRequestStatus,
  QueryCollectionRequestDto,
} from './dto/collection-request.dto';
import { v4 as uuid } from 'uuid';

@Injectable()
export class CollectionRequestsService {
  private readonly logger = new Logger(CollectionRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async create(creatorId: string, dto: CreateCollectionRequestDto) {
    // Get workspace info based on order or topup
    let workspaceId: string;
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { workspaceId: true, ownerUserId: true },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }
      if (order.ownerUserId !== creatorId) {
        throw new BadRequestException(
          'You can only create collection requests for your own orders',
        );
      }
      workspaceId = order.workspaceId;
    } else if (dto.topupRequestId) {
      const topup = await this.prisma.topupRequest.findUnique({
        where: { id: dto.topupRequestId },
        select: { workspaceId: true, ownerUserId: true },
      });
      if (!topup) {
        throw new NotFoundException('Topup request not found');
      }
      if (topup.ownerUserId !== creatorId) {
        throw new BadRequestException(
          'You can only create collection requests for your own topup requests',
        );
      }
      workspaceId = topup.workspaceId;
    } else {
      throw new BadRequestException(
        'Either orderId or topupRequestId must be provided',
      );
    }

    // Get money account
    const moneyAccount = await this.prisma.moneyAccount.findUnique({
      where: { id: dto.moneyAccountId },
    });
    if (!moneyAccount) {
      throw new NotFoundException('Money account not found');
    }

    // Generate collection request code
    const collectionRequestCode = await this.generateCode();

    // Setup Pay2S configuration
    const pay2sConfig = this.configService.get('pay2s');
    if (
      !pay2sConfig ||
      !pay2sConfig.partnerCode ||
      !pay2sConfig.apiKey ||
      !pay2sConfig.apiSecret
    ) {
      throw new BadRequestException('Pay2S configuration is missing');
    }

    const pay2sConfigData: Pay2sConfigData = {
      partner_code: pay2sConfig.partnerCode,
      api_key: pay2sConfig.apiKey,
      api_secret: pay2sConfig.apiSecret,
      api_url: pay2sConfig.apiUrl,
      partner_name: pay2sConfig.partnerName || 'Comvia',
    };

    // Setup URLs
    const redirectUrl = `${process.env.FRONTEND_BASE_URL || 'http://localhost:3000'}/collection-requests/${collectionRequestCode}`;
    const ipnUrl = `${process.env.BACKEND_BASE_URL || 'http://localhost:3000'}/webhooks/pay2s/ipn`;

    // Setup bank accounts
    const bankAccounts: Pay2sBankAccount[] = [
      {
        account_number: moneyAccount.accountNumber,
        bank_id: moneyAccount.pay2sBankId || '970418', // Default bank ID if not set
      },
    ];

    // Create Pay2S collection link
    // Generate orderInfo according to Pay2S requirements (10-32 chars, letters and numbers only)
    const orderInfo = `PAY${collectionRequestCode.replace(/[^a-zA-Z0-9]/g, '').substring(0, 28)}`;

    const pay2sResponse = await createPay2sCollectionLink({
      amount: dto.amount,
      orderId: collectionRequestCode,
      orderInfo,
      bankAccounts,
      redirectUrl,
      ipnUrl,
      pay2sConfigData,
    });

    if (!pay2sResponse || pay2sResponse.resultCode !== 0) {
      throw new BadRequestException(
        'Failed to create collection request on Pay2S',
      );
    }

    // Get QR code from response
    const qrCode = pay2sResponse.qrList?.[0]?.qrCode;
    if (!qrCode) {
      throw new BadRequestException('Failed to get QR code from Pay2S');
    }

    // Create collection request in database
    const collectionRequest = await this.prisma.$transaction(async (tx) => {
      const created = await tx.collectionRequest.create({
        data: {
          id: uuid(),
          code: collectionRequestCode,
          type: dto.type as any,
          status: CollectionRequestStatus.PENDING as any,
          amount: dto.amount,
          qrCodeUrl: qrCode,
          moneyAccountId: dto.moneyAccountId,
          workspaceId,
          orderId: dto.orderId,
          topupRequestId: dto.topupRequestId,
          creatorId,
        },
        include: {
          moneyAccount: true,
          workspace: true,
          creator: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      // Create mappings if invoice IDs provided
      if (
        dto.type === CollectionRequestType.INVOICE &&
        dto.invoiceIds &&
        dto.invoiceIds.length > 0
      ) {
        for (const invoiceId of dto.invoiceIds) {
          await tx.collectionRequestMapping.create({
            data: {
              collectionRequestId: created.id,
              invoiceId,
              amount: dto.amount / dto.invoiceIds.length, // Split amount equally
            },
          });
        }
      }

      return created;
    });

    return collectionRequest;
  }

  async findByWorkspace(workspaceId: string, query: QueryCollectionRequestDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      workspaceId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    const [total, data] = await Promise.all([
      this.prisma.collectionRequest.count({ where }),
      this.prisma.collectionRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          moneyAccount: {
            select: {
              id: true,
              accountNumber: true,
              bankName: true,
              bankCode: true,
            },
          },
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
          creator: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          mappings: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceCode: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const collectionRequest = await this.prisma.collectionRequest.findUnique({
      where: { id },
      include: {
        moneyAccount: {
          select: {
            id: true,
            accountNumber: true,
            bankName: true,
            bankCode: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
        mappings: {
          include: {
            invoice: {
              select: {
                id: true,
                invoiceCode: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!collectionRequest) {
      throw new NotFoundException('Collection request not found');
    }

    return collectionRequest;
  }

  async findByCode(code: string) {
    return this.prisma.collectionRequest.findUnique({
      where: { code },
      include: {
        moneyAccount: true,
        workspace: true,
        order: true,
        topupRequest: true,
        creator: true,
        mappings: {
          include: {
            invoice: true,
          },
        },
      },
    });
  }

  async processPay2sCallback(data: any) {
    const {
      transId,
      orderId: collectionRequestCode,
      amount,
      resultCode,
    } = data;

    const resultCodeNum = Number(resultCode);
    if (resultCodeNum !== 0 && resultCodeNum !== 2) {
      this.logger.log(
        `Payment not successful for collection request ${collectionRequestCode}, resultCode: ${resultCode}`,
      );
      return { success: false, message: 'Payment not successful' };
    }

    return await this.prisma.$transaction(async (tx) => {
      const collectionRequest = await tx.collectionRequest.findUnique({
        where: { code: collectionRequestCode },
        include: {
          order: true,
          topupRequest: true,
          mappings: {
            include: {
              invoice: true,
            },
          },
        },
      });

      if (!collectionRequest) {
        this.logger.error(
          `Collection request not found: ${collectionRequestCode}`,
        );
        return { success: false, message: 'Collection request not found' };
      }

      if (collectionRequest.status !== CollectionRequestStatus.PENDING) {
        this.logger.error(
          `Invalid status for collection request ${collectionRequestCode}: ${collectionRequest.status}`,
        );
        return { success: false, message: 'Invalid status' };
      }

      if (Number(collectionRequest.amount) !== Number(amount)) {
        this.logger.error(
          `Amount mismatch for collection request ${collectionRequestCode}: expected ${collectionRequest.amount}, received ${amount}`,
        );
        return { success: false, message: 'Amount mismatch' };
      }

      const paidAt = new Date();

      // Update collection request status
      const updated = await tx.collectionRequest.update({
        where: { code: collectionRequestCode },
        data: {
          status:
            resultCodeNum === 0
              ? (CollectionRequestStatus.PAID as any)
              : (CollectionRequestStatus.FAILED as any),
          transId: resultCodeNum === 0 ? transId : null,
          paidAt: resultCodeNum === 0 ? paidAt : null,
        },
      });

      if (resultCodeNum === 0) {
        // Process successful payment
        if (
          collectionRequest.type === CollectionRequestType.TOPUP &&
          collectionRequest.topupRequest
        ) {
          // Update topup request status
          await tx.topupRequest.update({
            where: { id: collectionRequest.topupRequest.id },
            data: {
              status: 'PAID',
              paidAt,
            },
          });

          // Create Order and Invoice for successful topup
          const order = await this.createTopupOrder(
            tx,
            collectionRequest,
            paidAt,
          );
          const invoice = await this.createTopupInvoice(
            tx,
            order,
            collectionRequest,
          );

          // Create wallet transaction (simplified)
          if (collectionRequest.topupRequest.ownerUserId) {
            // Note: This is simplified - in real implementation you'd update wallet balance
            this.logger.log(
              `Would update wallet for user ${collectionRequest.topupRequest.ownerUserId} with amount ${collectionRequest.amount}`,
            );
          }
        } else if (collectionRequest.type === CollectionRequestType.INVOICE) {
          // Process invoice payment - create payment records
          for (const mapping of collectionRequest.mappings) {
            if (mapping.invoiceId) {
              await tx.payment.create({
                data: {
                  code: `PAY_${Date.now()}`,
                  amount: mapping.amount,
                  method: 'BANK' as any,
                  referenceNo: collectionRequest.code,
                  note: `Payment via Pay2S for collection request ${collectionRequest.code}`,
                  paidAt,
                  customerId: collectionRequest.creatorId,
                  invoiceId: mapping.invoiceId,
                  orderId: collectionRequest.orderId,
                  moneyAccountId: collectionRequest.moneyAccountId,
                },
              });
            }
          }
        }
      }

      this.logger.log(
        `Successfully processed Pay2S callback for collection request ${collectionRequestCode}`,
      );
      return { success: true, collectionRequest: updated };
    });
  }

  private async createTopupOrder(
    tx: any,
    collectionRequest: any,
    paidAt: Date,
  ) {
    // Get workspace billing info for invoice
    const workspace = await tx.workspace.findUnique({
      where: { id: collectionRequest.workspaceId },
      include: { billingProfile: true },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Generate order code
    const orderCode = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate amounts - using strings to avoid Decimal issues
    const amountExclVat = collectionRequest.amount.toString();
    const vatRate = '0.1'; // 10% VAT
    const vatAmount = (
      parseFloat(amountExclVat) * parseFloat(vatRate)
    ).toString();
    const totalAmountInclVat = (
      parseFloat(amountExclVat) + parseFloat(vatAmount)
    ).toString();

    // Create order
    const order = await tx.order.create({
      data: {
        orderCode,
        workspaceId: collectionRequest.workspaceId,
        ownerUserId: collectionRequest.creatorId,
        orderType: 'topup',
        currency: 'VND',
        totalAmountExclVat: amountExclVat,
        totalVatAmount: vatAmount,
        totalAmountInclVat: totalAmountInclVat,
        paymentMethod: 'BANK',
        paymentRef: collectionRequest.code,
        status: 'PAID',
        paidAt,
        createdAt: new Date(),
      },
    });

    // Create order item
    await tx.orderItem.create({
      data: {
        orderId: order.id,
        name: 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS',
        quantity: 1,
        unitPrice: amountExclVat,
        vatRate: vatRate,
        vatAmount,
        totalAmountInclVat,
      },
    });

    this.logger.log(
      `Created order ${order.orderCode} for successful topup ${collectionRequest.code}`,
    );
    return order;
  }

  private async createTopupInvoice(
    tx: any,
    order: any,
    collectionRequest: any,
  ) {
    // Get workspace billing info
    const workspace = await tx.workspace.findUnique({
      where: { id: collectionRequest.workspaceId },
      include: { billingProfile: true },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Generate invoice code
    const invoiceCode = `INV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare billing snapshot
    let billingSnapshotJson: any = {
      type: workspace.billingProfile?.billingType || 'INDIVIDUAL',
    };

    if (workspace.billingProfile?.billingType === 'COMPANY') {
      billingSnapshotJson = {
        type: 'COMPANY',
        companyName: workspace.billingProfile.companyName,
        taxCode: workspace.billingProfile.taxCode,
        address: workspace.billingProfile.address,
        email: workspace.billingProfile.billingEmail,
        phone: workspace.billingProfile.billingPhone,
      };
    } else if (workspace.billingProfile?.billingType === 'INDIVIDUAL') {
      billingSnapshotJson = {
        type: 'INDIVIDUAL',
        fullName: workspace.billingProfile.fullName,
        idNumber: workspace.billingProfile.idNumber,
        address: workspace.billingProfile.address,
        email: workspace.billingProfile.billingEmail,
        phone: workspace.billingProfile.billingPhone,
      };
    }

    // Create invoice
    const invoice = await tx.invoice.create({
      data: {
        invoiceCode,
        invoiceNumber: null, // Will be assigned by accountant
        workspaceId: collectionRequest.workspaceId,
        orderId: order.id,
        billingType: workspace.billingProfile?.billingType || 'INDIVIDUAL',
        billingSnapshotJson: JSON.stringify(billingSnapshotJson),
        status: 'POSTED',
        issueDate: null, // Will be set by accountant
        createdAt: new Date(),
      },
    });

    // Create invoice item
    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        name: 'Phí dịch vụ hỗ trợ kinh doanh Zalo ZNS',
        quantity: 1,
        unitPrice: order.totalAmountExclVat,
        vatRate: '0.1',
        vatAmount: order.totalVatAmount,
        totalAmountInclVat: order.totalAmountInclVat,
      },
    });

    // Create collection request mapping
    await tx.collectionRequestMapping.create({
      data: {
        collectionRequestId: collectionRequest.id,
        invoiceId: invoice.id,
        amount: collectionRequest.amount,
        createdAt: new Date(),
      },
    });

    this.logger.log(
      `Created invoice ${invoice.invoiceCode} for successful topup ${collectionRequest.code}`,
    );
    return invoice;
  }

  private async generateCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const prefix = 'COMVIA';

    const buildCode = () =>
      `${prefix}${Array.from({ length: 6 })
        .map(() => chars.charAt(Math.floor(Math.random() * chars.length)))
        .join('')}`;

    let code = buildCode();
    let exists = await this.prisma.collectionRequest.findUnique({
      where: { code },
    });

    while (exists) {
      code = buildCode();
      exists = await this.prisma.collectionRequest.findUnique({
        where: { code },
      });
    }

    return code;
  }
}
