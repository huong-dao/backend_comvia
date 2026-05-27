import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import { WorkspaceRoles } from '../common/decorators/workspace-roles.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { WorkspaceRolesGuard } from '../common/guards/workspace-roles.guard';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

@Controller('workspaces/:workspaceId/audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @UseGuards(WorkspaceContextGuard, WorkspaceRolesGuard)
  @WorkspaceRoles(MemberRole.OWNER)
  list(
    @Param('workspaceId') workspaceId: string,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.auditLogService.list({
      workspaceId,
      action: query.action,
      limit: query.limit,
    });
  }
}
