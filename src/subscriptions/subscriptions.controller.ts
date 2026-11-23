import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceHeaderGuard } from '../common/guards/workspace-header.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { ListSubscriptionPlansQueryDto } from './dto/list-subscription-plans-query.dto';
import { ListSubscriptionPurchasesQueryDto } from './dto/list-subscription-purchases-query.dto';
import { PurchaseSubscriptionDto } from './dto/purchase-subscription.dto';
import { SubscriptionAccessService } from './subscription-access.service';
import { SubscriptionPlansService } from './subscription-plans.service';
import { SubscriptionPurchasesService } from './subscription-purchases.service';

type WorkspaceRequest = { workspace: { id: string; ownerUserId: string } };

/** Endpoint phía workspace (header `x-workspace-id`). */
@Controller()
@UseGuards(WorkspaceHeaderGuard, WorkspaceRolesGuard)
export class SubscriptionsController {
  constructor(
    private readonly plansService: SubscriptionPlansService,
    private readonly purchasesService: SubscriptionPurchasesService,
    private readonly accessService: SubscriptionAccessService,
  ) {}

  /** Các gói đang bán: phân trang, tìm theo tên/mã, lọc theo số năm. */
  @Get('subscription-plans')
  listPlans(@Query() query: ListSubscriptionPlansQueryDto) {
    return this.plansService.list(query, true);
  }

  /** Tình trạng subscription của workspace: gói, ngày bắt đầu/hết hạn, số ngày còn lại. */
  @Get('subscriptions/current')
  getCurrent(@Request() req: WorkspaceRequest) {
    return this.accessService.getStatus(req.workspace.id);
  }

  /** Tạo đơn mua + QR thanh toán Pay2S. */
  @Post('subscriptions/purchase/create-with-pay2s')
  @WorkspaceRoles(MemberRole.OWNER)
  purchase(
    @Request() req: WorkspaceRequest,
    @Body() dto: PurchaseSubscriptionDto,
  ) {
    return this.purchasesService.createPurchase(
      req.workspace.id,
      req.workspace.ownerUserId,
      dto,
    );
  }

  /** FE polling trạng thái thanh toán của đơn mua. */
  @Get('subscriptions/purchases/:purchaseCode/status')
  @WorkspaceRoles(MemberRole.OWNER)
  getPurchaseStatus(
    @Request() req: WorkspaceRequest,
    @Param('purchaseCode') purchaseCode: string,
  ) {
    return this.purchasesService.getPurchaseStatus(
      req.workspace.id,
      purchaseCode,
    );
  }

  /** Lịch sử mua (phân trang, lọc theo trạng thái). */
  @Get('subscriptions/history')
  @WorkspaceRoles(MemberRole.OWNER)
  listPurchases(
    @Request() req: WorkspaceRequest,
    @Query() query: ListSubscriptionPurchasesQueryDto,
  ) {
    return this.purchasesService.listPurchases(req.workspace.id, query);
  }
}
