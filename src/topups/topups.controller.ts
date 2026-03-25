import {
  Body,
  Controller,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MemberRole, UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CreateTopupQrDto } from './dto/create-topup-qr.dto';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';
import { TopupsService } from './topups.service';

@Controller('topups')
export class TopupsController {
  constructor(private readonly topupsService: TopupsService) {}

  @Post('workspaces/:workspaceId/qr')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  createQr(
    @Request() req: { workspace: { ownerUserId: string } },
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTopupQrDto,
  ) {
    return this.topupsService.createTopupQr(
      workspaceId,
      req.workspace.ownerUserId,
      dto,
    );
  }

  @Post('webhook')
  @Roles(UserRole.ADMIN)
  handleWebhook(@Body() dto: MockPaymentWebhookDto) {
    return this.topupsService.handleWebhook(dto);
  }
}
