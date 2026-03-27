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
import { WorkspaceHeaderGuard } from '../common/guards/workspace-header.guard';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { CreateTopupPay2sDto } from './dto/create-topup-pay2s.dto';
import { TopupsService } from './topups.service';

@Controller('topups')
export class TopupsController {
  constructor(private readonly topupsService: TopupsService) {}

  @Post('create-with-pay2s')
  @UseGuards(WorkspaceHeaderGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  createWithPay2s(
    @Request() req: { workspace: { ownerUserId: string; id: string } },
    @Body() dto: CreateTopupPay2sDto,
  ) {
    return this.topupsService.createTopupWithPay2S(
      req.workspace.id,
      req.workspace.ownerUserId,
      dto,
      dto.moneyAccountId,
    );
  }

  @Get(':topupCode/status')
  @UseGuards(WorkspaceHeaderGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  getTopupStatus(
    @Request() req: { workspace: { id: string } },
    @Param('topupCode') topupCode: string,
  ) {
    return this.topupsService.getTopupStatus(req.workspace.id, topupCode);
  }

  @Get('history')
  @UseGuards(WorkspaceHeaderGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  getTopupHistory(
    @Request() req: { workspace: { id: string } },
    @Query() query: any,
  ) {
    return this.topupsService.getTopupHistory(req.workspace.id, query);
  }
}
