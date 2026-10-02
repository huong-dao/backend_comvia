import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { AnalyticsService, AnalyticsOverview } from './analytics.service';
import { AnalyticsOverviewQueryDto } from './dto/analytics-overview-query.dto';

/**
 * Dashboard analytics read-only cấp workspace (ADR-003, BR-MSG-04).
 * Path gốc `workspaces/:workspaceId/analytics`; chỉ đọc, không ghi.
 * Role: OWNER + MEMBER đọc được (WorkspaceContextGuard + WorkspaceRolesGuard).
 */
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('overview')
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER, MemberRole.MEMBER)
  getOverview(
    @Param('workspaceId') workspaceId: string,
    @Query() query: AnalyticsOverviewQueryDto,
  ): Promise<AnalyticsOverview> {
    return this.service.getOverview(workspaceId, query.period);
  }
}
