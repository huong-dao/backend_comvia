import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import {
  GrantWorkspaceSubscriptionDto,
  UpdateWorkspaceSubscriptionDto,
} from './dto/admin-subscription.dto';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { ListSubscriptionPlansQueryDto } from './dto/list-subscription-plans-query.dto';
import { ListWorkspaceSubscriptionsQueryDto } from './dto/list-workspace-subscriptions-query.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { AdminSubscriptionsService } from './admin-subscriptions.service';
import { SubscriptionPlansService } from './subscription-plans.service';

type AdminRequest = { user: { id: string } };

/** Menu Subscriptions của ADMIN: quản lý gói + subscription của workspace. */
@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminSubscriptionsController {
  constructor(
    private readonly plansService: SubscriptionPlansService,
    private readonly subscriptionsService: AdminSubscriptionsService,
  ) {}

  // ---- Gói subscription -------------------------------------------------

  @Get('subscription-plans')
  listPlans(@Query() query: ListSubscriptionPlansQueryDto) {
    return this.plansService.list(query, false);
  }

  @Post('subscription-plans')
  createPlan(
    @Request() req: AdminRequest,
    @Body() dto: CreateSubscriptionPlanDto,
  ) {
    return this.plansService.create(req.user.id, dto);
  }

  @Get('subscription-plans/:planId')
  getPlan(@Param('planId') planId: string) {
    return this.plansService.get(planId);
  }

  @Patch('subscription-plans/:planId')
  updatePlan(
    @Request() req: AdminRequest,
    @Param('planId') planId: string,
    @Body() dto: UpdateSubscriptionPlanDto,
  ) {
    return this.plansService.update(req.user.id, planId, dto);
  }

  // ---- Subscription của workspace --------------------------------------

  @Get('subscriptions')
  listSubscriptions(@Query() query: ListWorkspaceSubscriptionsQueryDto) {
    return this.subscriptionsService.list(query);
  }

  @Get('subscriptions/:subscriptionId')
  getSubscription(@Param('subscriptionId') subscriptionId: string) {
    return this.subscriptionsService.get(subscriptionId);
  }

  /** Sửa gói / ngày bắt đầu / ngày hết hạn / trạng thái của một kỳ. */
  @Patch('subscriptions/:subscriptionId')
  updateSubscription(
    @Request() req: AdminRequest,
    @Param('subscriptionId') subscriptionId: string,
    @Body() dto: UpdateWorkspaceSubscriptionDto,
  ) {
    return this.subscriptionsService.update(req.user.id, subscriptionId, dto);
  }

  /** Cấp tay một kỳ subscription cho workspace (không qua thanh toán). */
  @Post('workspaces/:workspaceId/subscriptions')
  grantSubscription(
    @Request() req: AdminRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: GrantWorkspaceSubscriptionDto,
  ) {
    return this.subscriptionsService.grant(req.user.id, workspaceId, dto);
  }
}
